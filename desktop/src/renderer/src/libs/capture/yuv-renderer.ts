// WebGL2 renderer: uploads a yuvs (YUY2) frame to an integer texture and
// converts it to RGB in a fragment shader. Used by the uncompressed capture
// path, which delivers raw frames that a plain <video> can't display.
//
// Two-pass for display quality: pass 1 converts YUY2→RGB at source size into a
// framebuffer texture; pass 2 resamples it with Catmull-Rom bicubic directly
// into a canvas buffer matched to the element's PHYSICAL pixel size
// (clientWidth × devicePixelRatio). Rendering 1:1 with the display and using
// bicubic (instead of bilinear, which smears text) keeps fractional upscales
// as crisp as they can be — the browser never resamples the result.

const VERT = `#version 300 es
void main(){ vec2 v[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.)); gl_Position=vec4(v[gl_VertexID],0.,1.); }`

const FRAG_YUV = `#version 300 es
precision highp float; precision highp int;
uniform highp usampler2D tex; uniform int uH;
out vec4 frag;
void main(){
  int x=int(gl_FragCoord.x); int y=uH-1-int(gl_FragCoord.y); int mp=x>>1;
  uvec4 t=texelFetch(tex, ivec2(mp,y), 0);        // yuvs: Y0 U Y1 V
  float U=float(t.g), V=float(t.a);
  float Y=((x&1)==0)?float(t.r):float(t.b);
  float yy=Y-16.0, uu=U-128.0, vv=V-128.0;
  float r=1.164*yy+1.596*vv, g=1.164*yy-0.392*uu-0.813*vv, b=1.164*yy+2.017*uu;
  frag=vec4(clamp(vec3(r,g,b)/255.0,0.0,1.0),1.0);
}`

// Catmull-Rom bicubic via 9 bilinear fetches (Jimenez).
const FRAG_SCALE = `#version 300 es
precision highp float;
uniform sampler2D tex; uniform vec2 uSrcSize; uniform vec2 uOutSize; uniform float uSharp;
out vec4 frag;
vec4 catmullRom(vec2 uv){
  vec2 samplePos = uv * uSrcSize;
  vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - texPos1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 tc0 = (texPos1 - 1.0) / uSrcSize;
  vec2 tc3 = (texPos1 + 2.0) / uSrcSize;
  vec2 tc12 = (texPos1 + w2 / w12) / uSrcSize;
  vec4 r = vec4(0.0);
  r += texture(tex, vec2(tc0.x,  tc0.y))  * w0.x  * w0.y;
  r += texture(tex, vec2(tc12.x, tc0.y))  * w12.x * w0.y;
  r += texture(tex, vec2(tc3.x,  tc0.y))  * w3.x  * w0.y;
  r += texture(tex, vec2(tc0.x,  tc12.y)) * w0.x  * w12.y;
  r += texture(tex, vec2(tc12.x, tc12.y)) * w12.x * w12.y;
  r += texture(tex, vec2(tc3.x,  tc12.y)) * w3.x  * w12.y;
  r += texture(tex, vec2(tc0.x,  tc3.y))  * w0.x  * w3.y;
  r += texture(tex, vec2(tc12.x, tc3.y))  * w12.x * w3.y;
  r += texture(tex, vec2(tc3.x,  tc3.y))  * w3.x  * w3.y;
  return r;
}
void main(){
  // pass-1 output is already display-oriented; sample straight through
  vec2 uv = gl_FragCoord.xy / uOutSize;
  vec3 c = clamp(catmullRom(uv).rgb, 0.0, 1.0);

  // Contrast-adaptive sharpening (AMD CAS-style): sharpen flat/low-contrast
  // areas, back off at already-hard edges to avoid halos.
  vec2 d = 1.0 / uOutSize;
  vec3 n = texture(tex, uv + vec2( 0.0, -d.y)).rgb;
  vec3 s = texture(tex, uv + vec2( 0.0,  d.y)).rgb;
  vec3 e = texture(tex, uv + vec2( d.x,  0.0)).rgb;
  vec3 w = texture(tex, uv + vec2(-d.x,  0.0)).rgb;
  vec3 mn = min(min(min(n, s), min(e, w)), c);
  vec3 mx = max(max(max(n, s), max(e, w)), c);
  vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
  vec3 wgt = amp * (-1.0 / 5.0);
  vec3 outc = ((n + s + e + w) * wgt + c) / (4.0 * wgt + 1.0);

  // uSharp 0..1 blends from unsharpened to full-strength CAS.
  frag = vec4(clamp(mix(c, outc, uSharp), 0.0, 1.0), 1.0);
}`

export class YuvRenderer {
  private gl: WebGL2RenderingContext | null = null
  private canvas: HTMLCanvasElement | null = null
  private progYuv: WebGLProgram | null = null
  private progScale: WebGLProgram | null = null
  private uSrcSize: WebGLUniformLocation | null = null
  private uOutSize: WebGLUniformLocation | null = null
  private uSharp: WebGLUniformLocation | null = null
  private sharpness = 0.5
  private tex: WebGLTexture | null = null
  private rgbTex: WebGLTexture | null = null
  private fbo: WebGLFramebuffer | null = null
  private width = 0
  private height = 0

  init(canvas: HTMLCanvasElement, width: number, height: number): boolean {
    this.canvas = canvas
    this.width = width
    this.height = height
    // Keep the element's box at the source aspect; the buffer follows the
    // element's physical size (see syncSize) so display is always 1:1 pixels.
    canvas.style.aspectRatio = `${width} / ${height}`
    canvas.width = width
    canvas.height = height

    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false })
    if (!gl) return false
    this.gl = gl

    this.progYuv = this.link(gl, VERT, FRAG_YUV)
    this.progScale = this.link(gl, VERT, FRAG_SCALE)
    if (!this.progYuv || !this.progScale) return false

    gl.useProgram(this.progYuv)
    gl.uniform1i(gl.getUniformLocation(this.progYuv, 'tex'), 0)
    gl.uniform1i(gl.getUniformLocation(this.progYuv, 'uH'), height)

    gl.useProgram(this.progScale)
    gl.uniform1i(gl.getUniformLocation(this.progScale, 'tex'), 0)
    this.uSrcSize = gl.getUniformLocation(this.progScale, 'uSrcSize')
    this.uOutSize = gl.getUniformLocation(this.progScale, 'uOutSize')
    this.uSharp = gl.getUniformLocation(this.progScale, 'uSharp')
    gl.uniform2f(this.uSrcSize, width, height)

    // Source YUY2 texture (integer, exact texel reads in the shader).
    // Immutable storage — per-frame uploads use texSubImage2D (no realloc).
    this.tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8UI, width / 2, height)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // Intermediate RGB target at source size; LINEAR enables the 9-tap trick.
    this.rgbTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.rgbTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    this.fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.rgbTex, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('capture framebuffer incomplete')
      return false
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return true
  }

  // Match the drawing buffer to the element's physical pixels.
  private syncSize(): void {
    const c = this.canvas
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(c.clientWidth * dpr))
    const h = Math.max(1, Math.round(c.clientHeight * dpr))
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
    }
  }

  render(frame: Uint8Array): void {
    const gl = this.gl
    if (!gl) return
    this.syncSize()

    // Pass 1: YUY2 -> RGB at source size, into the FBO.
    gl.useProgram(this.progYuv)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.viewport(0, 0, this.width, this.height)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.width / 2,
      this.height,
      gl.RGBA_INTEGER,
      gl.UNSIGNED_BYTE,
      frame
    )
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Pass 2: bicubic resample to the physical-pixel backbuffer.
    const outW = gl.drawingBufferWidth
    const outH = gl.drawingBufferHeight
    gl.useProgram(this.progScale)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, outW, outH)
    gl.uniform2f(this.uOutSize, outW, outH)
    gl.uniform1f(this.uSharp, this.sharpness)
    gl.bindTexture(gl.TEXTURE_2D, this.rgbTex)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  setSharpness(value: number): void {
    this.sharpness = Math.min(1, Math.max(0, value))
  }

  dispose(): void {
    const gl = this.gl
    if (gl) {
      if (this.tex) gl.deleteTexture(this.tex)
      if (this.rgbTex) gl.deleteTexture(this.rgbTex)
      if (this.fbo) gl.deleteFramebuffer(this.fbo)
    }
    this.gl = null
    this.canvas = null
    this.tex = null
    this.rgbTex = null
    this.fbo = null
  }

  private link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)
      if (!sh) return null
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('shader compile error:', gl.getShaderInfoLog(sh))
        return null
      }
      return sh
    }
    const v = compile(gl.VERTEX_SHADER, vs)
    const f = compile(gl.FRAGMENT_SHADER, fs)
    if (!v || !f) return null
    const prog = gl.createProgram()
    if (!prog) return null
    gl.attachShader(prog, v)
    gl.attachShader(prog, f)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('program link error:', gl.getProgramInfoLog(prog))
      return null
    }
    return prog
  }
}
