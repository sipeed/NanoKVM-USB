#include <napi.h>
#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>
#include <thread>
#include <atomic>
#include <vector>
#include <algorithm>

static Napi::ThreadSafeFunction g_tsfn;
static CFMachPortRef g_eventTap = nullptr;
static CFRunLoopSourceRef g_runLoopSource = nullptr;
static CFRunLoopRef g_tapRunLoop = nullptr;
static std::thread g_tapThread;
static std::atomic<bool> g_running{false};

// Side-button identifiers emitted to JS (match Linux BTN_SIDE / BTN_EXTRA naming).
static const int kButtonSide = 0;
static const int kButtonExtra = 1;

struct FieldMatcher {
  CGEventField field;
  std::vector<int64_t> values;  // any-of match
};

struct Rule {
  CGEventType eventType;
  std::vector<FieldMatcher> fields;
  int button;  // kButtonSide or kButtonExtra
};

static std::vector<Rule> g_rules;
static CGEventMask g_eventMask = 0;

struct HookEvent {
  int kind;    // 0 = status, 1 = button
  int status;  // for kind == 0
  int button;  // for kind == 1: kButtonSide or kButtonExtra
};

static void sendStatus(int status) {
  HookEvent *he = new HookEvent{0, status, 0};
  g_tsfn.NonBlockingCall(he, [](Napi::Env env, Napi::Function callback, HookEvent *data) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("kind", "status");
    obj.Set("status", data->status == 0 ? "ok" : "failed");
    callback.Call({obj});
    delete data;
  });
}

static void sendButton(int button) {
  HookEvent *he = new HookEvent{1, 0, button};
  g_tsfn.NonBlockingCall(he, [](Napi::Env env, Napi::Function callback, HookEvent *data) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("kind", "button");
    obj.Set("button", data->button == kButtonExtra ? "extra" : "side");
    callback.Call({obj});
    delete data;
  });
}

static CGEventRef eventTapCallback(
    CGEventTapProxy proxy,
    CGEventType type,
    CGEventRef event,
    void *refcon) {
  (void)proxy;
  (void)refcon;

  if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
    if (g_eventTap) {
      CGEventTapEnable(g_eventTap, true);
    }
    return event;
  }

  for (const auto& rule : g_rules) {
    if (type != rule.eventType) continue;
    bool match = true;
    for (const auto& fm : rule.fields) {
      int64_t v = CGEventGetIntegerValueField(event, fm.field);
      if (std::find(fm.values.begin(), fm.values.end(), v) == fm.values.end()) {
        match = false;
        break;
      }
    }
    if (match) {
      sendButton(rule.button);
      break;  // first match wins
    }
  }

  return event;
}

static bool parseRules(Napi::Env env, Napi::Array arr, std::vector<Rule>& out, CGEventMask& mask) {
  out.clear();
  mask = 0;

  for (uint32_t i = 0; i < arr.Length(); i++) {
    Napi::Value item = arr.Get(i);
    if (!item.IsObject()) {
      Napi::TypeError::New(env, "Each rule must be an object").ThrowAsJavaScriptException();
      return false;
    }
    Napi::Object obj = item.As<Napi::Object>();

    if (!obj.Has("eventType") || !obj.Get("eventType").IsNumber()) {
      Napi::TypeError::New(env, "Rule must have numeric 'eventType'").ThrowAsJavaScriptException();
      return false;
    }
    if (!obj.Has("emit") || !obj.Get("emit").IsString()) {
      Napi::TypeError::New(env, "Rule must have string 'emit'").ThrowAsJavaScriptException();
      return false;
    }

    Rule rule;
    rule.eventType = (CGEventType)obj.Get("eventType").As<Napi::Number>().Uint32Value();

    std::string emit = obj.Get("emit").As<Napi::String>().Utf8Value();
    if (emit == "side") {
      rule.button = kButtonSide;
    } else if (emit == "extra") {
      rule.button = kButtonExtra;
    } else {
      Napi::TypeError::New(env, "Rule 'emit' must be 'side' or 'extra'").ThrowAsJavaScriptException();
      return false;
    }

    if (obj.Has("fields")) {
      Napi::Value fieldsVal = obj.Get("fields");
      if (!fieldsVal.IsArray()) {
        Napi::TypeError::New(env, "Rule 'fields' must be an array").ThrowAsJavaScriptException();
        return false;
      }
      Napi::Array fields = fieldsVal.As<Napi::Array>();
      for (uint32_t j = 0; j < fields.Length(); j++) {
        Napi::Value fmVal = fields.Get(j);
        if (!fmVal.IsObject()) {
          Napi::TypeError::New(env, "Each field matcher must be an object").ThrowAsJavaScriptException();
          return false;
        }
        Napi::Object fmObj = fmVal.As<Napi::Object>();

        if (!fmObj.Has("field") || !fmObj.Get("field").IsNumber()) {
          Napi::TypeError::New(env, "Field matcher must have numeric 'field'").ThrowAsJavaScriptException();
          return false;
        }
        if (!fmObj.Has("equals")) {
          Napi::TypeError::New(env, "Field matcher must have 'equals'").ThrowAsJavaScriptException();
          return false;
        }

        FieldMatcher matcher;
        matcher.field = (CGEventField)fmObj.Get("field").As<Napi::Number>().Uint32Value();

        Napi::Value eq = fmObj.Get("equals");
        if (eq.IsNumber()) {
          matcher.values.push_back(eq.As<Napi::Number>().Int64Value());
        } else if (eq.IsArray()) {
          Napi::Array eqArr = eq.As<Napi::Array>();
          for (uint32_t k = 0; k < eqArr.Length(); k++) {
            Napi::Value v = eqArr.Get(k);
            if (!v.IsNumber()) {
              Napi::TypeError::New(env, "'equals' array entries must be numbers").ThrowAsJavaScriptException();
              return false;
            }
            matcher.values.push_back(v.As<Napi::Number>().Int64Value());
          }
        } else {
          Napi::TypeError::New(env, "'equals' must be a number or array of numbers").ThrowAsJavaScriptException();
          return false;
        }

        rule.fields.push_back(matcher);
      }
    }

    mask |= CGEventMaskBit(rule.eventType);
    out.push_back(std::move(rule));
  }

  return true;
}

static Napi::Value StartHook(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (g_running) {
    Napi::Error::New(env, "Hook is already running").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info.Length() < 2 || !info[0].IsArray() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "Expected (rules: Array, callback: Function)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::vector<Rule> rules;
  CGEventMask mask = 0;
  if (!parseRules(env, info[0].As<Napi::Array>(), rules, mask)) {
    return env.Undefined();
  }
  if (rules.empty()) {
    Napi::Error::New(env, "Rules array must not be empty").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  g_rules = std::move(rules);
  g_eventMask = mask;

  Napi::Function callback = info[1].As<Napi::Function>();
  g_tsfn = Napi::ThreadSafeFunction::New(env, callback, "MouseHookCallback", 0, 1);
  g_running = true;

  g_tapThread = std::thread([]() {
    g_eventTap = CGEventTapCreate(
        kCGSessionEventTap,
        kCGHeadInsertEventTap,
        kCGEventTapOptionListenOnly,
        g_eventMask,
        eventTapCallback,
        nullptr);

    if (!g_eventTap) {
      sendStatus(1);
      g_running = false;
      return;
    }

    sendStatus(0);

    g_runLoopSource =
        CFMachPortCreateRunLoopSource(kCFAllocatorDefault, g_eventTap, 0);
    g_tapRunLoop = CFRunLoopGetCurrent();
    CFRunLoopAddSource(g_tapRunLoop, g_runLoopSource, kCFRunLoopCommonModes);
    CGEventTapEnable(g_eventTap, true);

    CFRunLoopRun();

    CGEventTapEnable(g_eventTap, false);
    CFRelease(g_runLoopSource);
    CFRelease(g_eventTap);
    g_eventTap = nullptr;
    g_runLoopSource = nullptr;
    g_tapRunLoop = nullptr;
    g_running = false;
  });

  return env.Undefined();
}

static Napi::Value StopHook(const Napi::CallbackInfo &info) {
  if (!g_running) {
    return info.Env().Undefined();
  }

  if (g_tapRunLoop) {
    CFRunLoopStop(g_tapRunLoop);
  }

  if (g_tapThread.joinable()) {
    g_tapThread.join();
  }

  g_tsfn.Release();
  return info.Env().Undefined();
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startHook", Napi::Function::New(env, StartHook));
  exports.Set("stopHook", Napi::Function::New(env, StopHook));
  return exports;
}

NODE_API_MODULE(mouse_hook, Init)
