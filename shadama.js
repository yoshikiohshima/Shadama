function ShadamaFactory(frame, optDimension, parent, optDefaultProgName, optDOMTools) {
    var threeRenderer = frame ? frame.renderer : null;
    var TEXTURE_SIZE = 1024;
    var FIELD_WIDTH = 512;
    var FIELD_HEIGHT = 512;

    var VOXEL_STEP = 8;
    var VOXEL_WIDTH = 512;
    var VOXEL_HEIGHT = 512;
    var VOXEL_DEPTH = 512;

    var VOXEL_TEXTURE_WIDTH = 512; // sqrt(512 * 512 * 512 / 8 / 8 / 8);
    var VOXEL_TEXTURE_HEIGHT = 512; // sqrt(512 * 512 * 512 / 8 / 8 / 8);

    var T = TEXTURE_SIZE;
    var FW = FIELD_WIDTH;
    var FH = FIELD_HEIGHT;

    var VS = VOXEL_STEP;
    var VW = VOXEL_WIDTH;
    var VH = VOXEL_HEIGHT;
    var VD = VOXEL_DEPTH;

    var VTW = VOXEL_TEXTURE_WIDTH;
    var VTH = VOXEL_TEXTURE_HEIGHT;

    var N = "_new_";

    var dimension = optDimension || 3; // 2 | 3;

    // need to change things around here so that you can have different Shadma instances with different sizes

    var breedVAO;
    var patchVAO;
    var programs = {};  // {name: {prog: shader, vao: VAO, uniLocations: uniformLocs}}

    var renderer;
    var gl;
    var state;
    var audioContext;

    var renderRequests = [];

    var targetTexture; // THREE.js texture, not WebGL texture

    var debugCanvas1;
    var debugArray;
    var debugArray1;
    var debugArray2;

    var debugTextureBreed;
    var debugTexturePatch;
    var framebufferDBreed;  // for debugging u8rgba texture
    var framebufferDPatch;  // for debugging u8rgba texture

    var framebufferBreed;
    var framebufferPatch;
    var framebufferDiffuse;
    var framebufferU8RGBA;  // for three js u8rgba texture

    var readFramebufferBreed;
    var readFramebufferPatch;
    var writeFramebufferBreed;
    var writeFramebufferPatch;

    var editor = null;
    var editorType = null;
    var parseErrorWidget = null;

    var domTools = false;

    var readout;
    var watcherList;  // DOM
    var watcherElements = []; // [DOM]
    var envList; // DOM

    var shadamaCanvas;
    var fullScreenScale = 1;

    var keepGoing = true;
    var animationRequested = false;

    var times = [];

    var withThreeJS;
    var runTests;
    var showAllEnv;
    var degaussdemo;

    var fragments = {
        patchInput: {
            float2: `
  float _x = texelFetch(u_that_x, ivec2(a_index), 0).r;
  float _y = texelFetch(u_that_y, ivec2(a_index), 0).r;
  vec2 _pos = vec2(_x, _y);
`,
            vec2: `
  vec2 _pos = texelFetch(u_that_xy, ivec2(a_index), 0).rg;
`,},

        noPatchInput:`
  vec2 _pos = a_index;
`,

        blockPatchPrologue: `
  vec2 oneToOne = ((_pos / u_resolution) + u_half) * 2.0 - 1.0;
`,

        blockBreedPrologue: `
  vec2 oneToOne = (b_index + u_half) * 2.0 - 1.0;
`,

        blockEpilogue: `
  gl_Position = vec4(oneToOne, 0.0, 1.0);
  gl_PointSize = 1.0;
`,

        patchPrologue: {
            float2: `
uniform sampler2D u_that_x;
uniform sampler2D u_that_y;
`,
            vec2: `
uniform sampler2D u_that_xy;
`,
            float3: `
uniform sampler2D u_that_x;
uniform sampler2D u_that_y;
uniform sampler2D u_that_z;
`,
            vec3: `
uniform sampler2D u_that_xyz;
`,
},

        breedPrologue: {
            "2": `#version 300 es
precision highp float;
layout (location = 0) in vec2 a_index;
layout (location = 1) in vec2 b_index;
uniform vec2 u_resolution;
uniform vec2 u_half;
`},
        
            "3": `#version 300 es
precision highp float;
layout (location = 0) in vec2 a_index;
layout (location = 1) in vec2 b_index;
uniform vec3 u_resolution;
uniform vec2 u_half;
`};
        
    var shaders = {
        "drawBreed.vert":
        `#version 300 es
        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;

        uniform vec2 u_resolution;
        uniform vec2 u_half;

        uniform sampler2D u_x;
        uniform sampler2D u_y;

        uniform sampler2D u_r;
        uniform sampler2D u_g;
        uniform sampler2D u_b;
        uniform sampler2D u_a;

        out vec4 v_color;

        void main(void) {
            ivec2 fc = ivec2(a_index);
            float x = texelFetch(u_x, fc, 0).r;
            float y = texelFetch(u_y, fc, 0).r;
            vec2 dPos = vec2(x, y);   // (0-resolution, 0-resolution)
            vec2 normPos = dPos / u_resolution;  // (0-1.0, 0-1.0)
            vec2 clipPos = (normPos + u_half) * 2.0 - 1.0;  // (-1.0-1.0, -1.0-1.0)
            gl_Position = vec4(clipPos, 0, 1.0);

            float r = texelFetch(u_r, fc, 0).r;
            float g = texelFetch(u_g, fc, 0).r;
            float b = texelFetch(u_b, fc, 0).r;
            float a = texelFetch(u_a, fc, 0).r;
            v_color = vec4(r, g, b, a);
            gl_PointSize = 1.0;
        }`,

        "drawBreed.frag":
        `#version 300 es
        precision highp float;

        in vec4 v_color;
        out vec4 fragColor;

        void main(void) {
            fragColor = v_color;
        }`,

        "drawBreedVec.vert":
        `#version 300 es
        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;

        uniform vec2 u_resolution;
        uniform vec2 u_half;

        uniform sampler2D u_xy;
        uniform sampler2D u_c;

        out vec4 v_color;

        void main(void) {
            ivec2 fc = ivec2(a_index);
            vec2 dPos = texelFetch(u_xy, fc, 0).rg; // (0-resolution, 0-resolution)
            vec2 normPos = dPos / u_resolution;  // (0-1.0, 0-1.0)
            vec2 clipPos = (normPos + u_half) * 2.0 - 1.0;  // (-1.0-1.0, -1.0-1.0)
            gl_Position = vec4(clipPos, 0, 1.0);

            v_color = texelFetch(u_c, fc, 0);
            gl_PointSize = 1.0;
        }`,

        "drawBreedVec.frag":
        `#version 300 es
        precision highp float;

        in vec4 v_color;
        out vec4 fragColor;

        void main(void) {
            fragColor = v_color;
        }`,

        "drawPatch.vert":
        `#version 300 es
        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;

        uniform vec2 u_resolution;
        uniform vec2 u_half;

        uniform sampler2D u_r;
        uniform sampler2D u_g;
        uniform sampler2D u_b;
        uniform sampler2D u_a;

        out vec4 v_color;

        void main(void) {
            vec2 clipPos = (b_index + u_half) * 2.0 - 1.0;  // (-1.0-1.0, -1.0-1.0)
            gl_Position = vec4(clipPos, 0, 1.0);
            gl_PointSize = 1.0;

            ivec2 fc = ivec2(a_index);

            float r = texelFetch(u_r, fc, 0).r;
            float g = texelFetch(u_g, fc, 0).r;
            float b = texelFetch(u_b, fc, 0).r;
            float a = texelFetch(u_a, fc, 0).r;
            v_color = vec4(r, g, b, a);
        }`,

        "drawPatch.frag":
        `#version 300 es
        precision highp float;

        in vec4 v_color;
        out vec4 fragColor;

        void main(void) {
            fragColor = v_color;
        }`,

        "debug.vert":
        `#version 300 es
        precision highp float;
        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;

        uniform sampler2D u_value;
        uniform vec2 u_half;

        out vec4 v_color;

        void main(void) {
            vec2 clipPos = (b_index + u_half) * 2.0 - 1.0;  // (-1.0-1.0, -1.0-1.0)
            gl_Position = vec4(clipPos, 0, 1.0);
            gl_PointSize = 1.0;

            ivec2 fc = ivec2(a_index);
            v_color = texelFetch(u_value, fc, 0);
        }`,

        "debug.frag":
        `#version 300 es
        precision highp float;

        in vec4 v_color;
        out vec4 fragColor;

        void main(void) {
            fragColor = v_color;
        }`,

        "renderBreed.vert":
        `#version 300 es
        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;

        uniform mat4 mvMatrix;
        uniform mat4 pMatrix;
        uniform vec3 u_resolution;
        uniform vec3 u_half;

        uniform sampler2D u_x;
        uniform sampler2D u_y;
        uniform sampler2D u_z;

        uniform sampler2D u_r;
        uniform sampler2D u_g;
        uniform sampler2D u_b;
        uniform sampler2D u_a;

        uniform sampler2D u_d;
        uniform float u_dotSize;
        uniform bool u_use_vector;

        out vec4 v_color;

        void main(void) {
            ivec2 fc = ivec2(a_index);
            float x = texelFetch(u_x, fc, 0).r;
            float y = texelFetch(u_y, fc, 0).r;
            float z = texelFetch(u_z, fc, 0).r;
            vec3 dPos = vec3(x, y, z);
            vec3 normPos = dPos / u_resolution;
            vec3 clipPos = ((normPos + u_half) * 2.0 - 1.0) * (u_resolution.x / 2.0);

            vec4 mvPos = mvMatrix * vec4(clipPos, 1.0);

            gl_Position = pMatrix * mvPos;

            float r = texelFetch(u_r, fc, 0).r;
            float g = texelFetch(u_g, fc, 0).r;
            float b = texelFetch(u_b, fc, 0).r;
            float a = texelFetch(u_a, fc, 0).r;
            v_color = vec4(r, g, b, a);
            gl_PointSize = ((u_use_vector ? texelFetch(u_d, fc, 0).r : u_dotSize) / -mvPos.z);
        }`,

        "renderBreed.frag":
        `#version 300 es
        precision highp float;

        in vec4 v_color;

        out vec4 fragColor;

        void main(void) {
            fragColor = v_color;
        }`,

        "renderPatch.vert":
        `#version 300 es
        precision highp float;
        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;

        uniform mat4 mvMatrix;
        uniform mat4 pMatrix;
        uniform vec3 u_resolution;
        uniform vec3 v_resolution;
        uniform int v_step;
        uniform vec3 u_half;

        uniform sampler2D u_r;
        uniform sampler2D u_g;
        uniform sampler2D u_b;
        uniform sampler2D u_a;

        out vec4 v_color;

        void main(void) {
            ivec2 fc = ivec2(a_index);
            ivec3 iv_resolution = ivec3(v_resolution);
            // the framebuffer will be 512^512, which is square of cube root of 64 * 64 * 64
            // fc varies over this.

            int index = int(a_index.y) * int(u_resolution.x) + int(a_index.x);

            int z = index / (iv_resolution.x * iv_resolution.y);
            int xy = index % (iv_resolution.x * iv_resolution.y);

            int x = xy % iv_resolution.x;
            int y = xy / iv_resolution.x;

            x = x * v_step;
            y = y * v_step;
            z = z * v_step;

            vec3 dPos = vec3(x, y, z);
            vec3 normPos = dPos / u_resolution;
            vec3 clipPos = ((normPos + u_half) * 2.0 - 1.0) * (u_resolution.x / 2.0);

            vec4 mvPos = mvMatrix * vec4(clipPos, 1.0);
            gl_Position = pMatrix * mvPos;
            gl_PointSize = 24.0 * ( 24.0 / -mvPos.z );

            float r = texelFetch(u_r, fc, 0).r;
            float g = texelFetch(u_g, fc, 0).r;
            float b = texelFetch(u_b, fc, 0).r;
            float a = texelFetch(u_a, fc, 0).r;

            v_color = vec4(r, g, b, a);

        }`,

        "renderPatch.frag":
        `#version 300 es
        precision highp float;

        in vec4 v_color;

        out vec4 fragColor;

        void main(void) {
            fragColor = v_color;
        }`,

        "diffusePatch.vert":
        `#version 300 es
        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;

        uniform vec2 u_half;
        uniform sampler2D u_value;

        out float v_value;

        const float weight[9] = float[9](
            0.077847, 0.123317, 0.077847,
            0.123317, 0.195346, 0.123317,
            0.077847, 0.123317, 0.077847
        );

        void main(void) {
            vec2 clipPos = (b_index + u_half) * 2.0 - 1.0;  // (-1.0-1.0, -1.0-1.0)
            gl_Position = vec4(clipPos, 0, 1.0);
            gl_PointSize = 1.0;

            ivec2 fc = ivec2(a_index);
            float v = 0.0;
            v += texelFetch(u_value, fc + ivec2(-1, -1), 0).r * weight[0];
            v += texelFetch(u_value, fc + ivec2(-1,  0), 0).r * weight[1];
            v += texelFetch(u_value, fc + ivec2(-1,  1), 0).r * weight[2];
            v += texelFetch(u_value, fc + ivec2( 0, -1), 0).r * weight[3];
            v += texelFetch(u_value, fc + ivec2( 0,  0), 0).r * weight[4];
            v += texelFetch(u_value, fc + ivec2( 0,  1), 0).r * weight[5];
            v += texelFetch(u_value, fc + ivec2( 1, -1), 0).r * weight[6];
            v += texelFetch(u_value, fc + ivec2( 1,  0), 0).r * weight[7];
            v += texelFetch(u_value, fc + ivec2( 1,  1), 0).r * weight[8];
            v = v <= (1.0/256.0) ? 0.0 : v;
            v_value = v;
        }`,

        "diffusePatch.frag":
        `#version 300 es
        precision highp float;
        in float v_value;
        layout (location = 0) out float fragColor;

        void main(void) {
            fragColor = v_value;
        }`,

        "increasePatch.vert":
        `#version 300 es
        precision highp float;

        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;

        uniform vec2 u_resolution;
        uniform vec2 u_half;

        uniform sampler2D u_that_x;
        uniform sampler2D u_that_y;

        uniform bool u_use_vector;
        uniform sampler2D u_texture;
        uniform float u_value;

        out float v_value;

        void main() {

            float _x = texelFetch(u_that_x, ivec2(a_index), 0).r;
            float _y = texelFetch(u_that_y, ivec2(a_index), 0).r;
            vec2 _pos = vec2(_x, _y);
            vec2 oneToOne = ((_pos / u_resolution) + u_half) * 2.0 - 1.0;

            gl_Position = vec4(oneToOne, 0.0, 1.0);
            gl_PointSize = 1.0;

            v_value = u_use_vector ? texelFetch(u_texture, ivec2(a_index), 0).r : u_value;
        }`,

        "increasePatch.frag":
        `#version 300 es
        precision highp float;
        in float v_value;
        layout (location = 0) out float fragColor;
        void main() {
            fragColor = v_value;
        }`,

        "increaseVoxel.vert":
        `#version 300 es
        precision highp float;

        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;

        uniform vec2 u_resolution;
        uniform vec3 v_resolution;
        uniform float v_step;
        uniform vec2 u_half;

        uniform sampler2D u_that_x;
        uniform sampler2D u_that_y;
        uniform sampler2D u_that_z;

        uniform bool u_use_vector;
        uniform sampler2D u_texture;
        uniform float u_value;

        out float v_value;

        void main() {
            ivec2 fc = ivec2(a_index);
            float _x = texelFetch(u_that_x, fc, 0).r;
            float _y = texelFetch(u_that_y, fc, 0).r;
            float _z = texelFetch(u_that_z, fc, 0).r;

            _x = floor(_x / v_step); // 8   //  [0..64), if originally within [0..512)
            _y = floor(_y / v_step); // 8
            _z = floor(_z / v_step); // 8

            int index = int(_z * v_resolution.x * v_resolution.y + _y * v_resolution.x + _x);
            vec2 _pos = vec2(index % int(u_resolution.x), index / int(u_resolution.x));
            vec2 oneToOne = ((_pos / u_resolution) + u_half) * 2.0 - 1.0;

            gl_Position = vec4(oneToOne, 0.0, 1.0);
            gl_PointSize = 1.0;

            v_value = u_use_vector ? texelFetch(u_texture, ivec2(a_index), 0).r : u_value;
        }`,
        "increaseVoxel.frag":
        `#version 300 es
        precision highp float;
        in float v_value;
        layout (location = 0) out float fragColor;
        void main() {
            fragColor = v_value;
        }`,
    }

    function initBreedVAO() {
        var allIndices = new Array(T * T * 2);
        var divIndices = new Array(T * T * 2);
        for (var j = 0; j < T; j++) {
            for (var i = 0; i < T; i++) {
                var ind = ((j * T) + i) * 2;
                allIndices[ind + 0] = i;
                allIndices[ind + 1] = j;
                divIndices[ind + 0] = i / T;
                divIndices[ind + 1] = j / T;
            }
        }

        breedVAO = gl.createVertexArray();
        gl.bindVertexArray(breedVAO);

        var aBuffer = gl.createBuffer();
        var bBuffer = gl.createBuffer();

        var attrLocations = new Array(2);
        attrLocations[0] = 0 // gl.getAttribLocation(prog, 'a_index'); a_index has layout location spec
        attrLocations[1] = 1 // gl.getAttribLocation(prog, 'b_index'); b_index has layout location spec

        var attrStrides = new Array(2);
        attrStrides[0] = 2;
        attrStrides[1] = 2;

        setBufferAttribute([aBuffer, bBuffer], [allIndices, divIndices], attrLocations, attrStrides);
        gl.bindVertexArray(null);
    }

    function initPatchVAO() {
        var w;
        var h;
        if (dimension == 2) {
            var w = FW;
            var h = FH;
        } else {
            var w = VTW;
            var h = VTH;
        }
        var allIndices = new Array(w * h * 2);
        var divIndices = new Array(w * h * 2);
        for (var j = 0; j < h; j++) {
            for (var i = 0; i < w; i++) {
                var ind = ((j * w) + i) * 2;
                allIndices[ind + 0] = i;
                allIndices[ind + 1] = j;
                divIndices[ind + 0] = i / w;
                divIndices[ind + 1] = j / h;
            }
        }

        patchVAO = gl.createVertexArray();
        gl.bindVertexArray(patchVAO);

        var aBuffer = gl.createBuffer();
        var bBuffer = gl.createBuffer();

        var attrLocations = new Array(2);
        attrLocations[0] = 0 // gl.getAttribLocation(prog, 'a_index'); a_index has layout location spec
        attrLocations[1] = 1 // gl.getAttribLocation(prog, 'b_index'); b_index has layout location spec

        var attrStrides = new Array(2);
        attrStrides[0] = 2;
        attrStrides[1] = 2;

        setBufferAttribute([aBuffer, bBuffer], [allIndices, divIndices], attrLocations, attrStrides);
        gl.bindVertexArray(null);
    }

    function makePrimitive(name, uniforms, vao) {
        var vs = createShader(name + ".vert", shaders[name+'.vert']);
        var fs = createShader(name + ".frag", shaders[name+'.frag']);

        var prog = createProgram(vs, fs);

        var uniLocations = {};
        uniforms.forEach(function (n) {
            uniLocations[n] = gl.getUniformLocation(prog, n);
        });

        return {program: prog, uniLocations: uniLocations, vao: vao};
    }

    function drawBreedProgram() {
        return makePrimitive("drawBreed", ["u_resolution", "u_half", "u_x", "u_y", "u_r", "u_g", "u_b", "u_a"], breedVAO);
    }

    function drawBreedVecProgram() {
        return makePrimitive("drawBreedVec", ["u_resolution", "u_half", "u_xy", "u_c"], breedVAO);
    }

    function drawPatchProgram() {
        return makePrimitive("drawPatch", ["u_resolution", "u_half", "u_a", "u_r", "u_g", "u_b"], patchVAO);
    }

    function debugBreedProgram() {
        return makePrimitive("debug", ["u_value", "u_half"], breedVAO);
    }

    function debugPatchProgram() {
        return makePrimitive("debug", ["u_value", "u_half"], patchVAO);
    }

    function renderBreedProgram() {
        return makePrimitive("renderBreed", ["mvMatrix", "pMatrix", "u_resolution", "u_half", "u_x", "u_y", "u_z", "u_r", "u_g", "u_b", "u_a", "u_d", "u_dotSize", "u_use_vector"], breedVAO);
    }

    function renderPatchProgram() {
        return makePrimitive("renderPatch", ["mvMatrix", "pMatrix", "u_resolution", "u_half", "v_resolution", "v_step", "u_r", "u_g", "u_b", "u_a"], patchVAO);
    }

    function diffusePatchProgram() {
        return makePrimitive("diffusePatch", ["u_value", "u_half",], patchVAO);
    }

    function increasePatchProgram() {
        return makePrimitive("increasePatch", ["u_resolution", "u_half", "u_that_x", "u_that_y", "u_use_vector", "u_texture", "u_value"], breedVAO);
    }

    function increaseVoxelProgram() {
        return makePrimitive("increaseVoxel", ["u_resolution", "u_half", "v_resolution", "v_step", "u_that_x", "u_that_y", "u_that_z", "u_use_vector", "u_texture", "u_value"], breedVAO);
    }

    function createShader(id, source) {
        var type;
        if (id.endsWith(".vert")) {
            type = gl.VERTEX_SHADER;
        } else if (id.endsWith(".frag")) {
            type = gl.FRAGMENT_SHADER;
        }

        var shader = gl.createShader(type);

        if (!source) {
            var scriptElement = document.getElementById(id);
            if(!scriptElement){return;}
            source = scriptElement.text;
        }
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (success) {
            return shader;
        }
        console.log(source);
        console.log(gl.getShaderInfoLog(shader));
        alert(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
    }

    function createProgram(vertexShader, fragmentShader) {
        var program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        var success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (success) {
            return program;
        }

        console.log(gl.getProgramInfoLog(program));
        //    alert(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
    }

    function createTexture(data, format, width, height, type) {
        if (!type) {
            type = gl.FLOAT;
        }

        var tex = gl.createTexture();
        state.bindTexture(gl.TEXTURE_2D, tex);

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, false);

        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, width);
        gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, height);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, 0);

        if (type == gl.UNSIGNED_BYTE) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, type, data, 0);
        } else if (format == gl.R32F) {
            gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, gl.RED, gl.FLOAT, data, 0);
        } else if (format == gl.RG32F) {
            gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, gl.RG, gl.FLOAT, data, 0);
        } else if (format == gl.RGB32F) {
            gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, gl.RGB, gl.FLOAT, data, 0);
        } else if (format == gl.RGBA32F) {
            gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, gl.RGBA, gl.FLOAT, data, 0);
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        state.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    function makeFramebuffer(format, width, height) {
        var tex;
        if (format == gl.RGBA32F) {
            tex = createTexture(new Float32Array(width * height * 4), format, width, height);
        }
        if (format == gl.R32F) {
            tex = createTexture(new Float32Array(width * height), format, width, height);
        }
        if (format == gl.RGBA) {
            tex = createTexture(new Uint8Array(width * height * 4), format, width, height, gl.UNSIGNED_BYTE);
        }

        var buffer = gl.createFramebuffer();

        gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
        state.bindTexture(gl.TEXTURE_2D, tex);

        if (format == gl.R32F) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, null);
        } else if (format == gl.UNSIGNED_BYTE) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
        }
        state.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        if (withThreeJS) {
            var target = new THREE.WebGLRenderTarget(width, height);
            renderer.properties.get(target).__webglFramebuffer = buffer;
            gl.deleteTexture(tex);
            return target;
        } else {
            return buffer;
        }
    }

    function setTargetBuffer(buffer, tex) {
        renderer.setRenderTarget(buffer);
        if (buffer) {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        }
    }

    function setTargetBuffers(buffer, tex) {
        if (!buffer) {
            renderer.setRenderTarget(null, gl.DRAW_FRAMEBUFFER);
            return;
        }

        var list = [];
        renderer.setRenderTarget(buffer, gl.DRAW_FRAMEBUFFER);
        for (var i = 0; i < tex.length; i++) {
            var val = gl.COLOR_ATTACHMENT0 + i;
            gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, val, gl.TEXTURE_2D, tex[i], 0);
            list.push(val);
        }
        gl.drawBuffers(list);
    }

    function setBufferAttribute(buffers, data, attrL, attrS) {
        for (var i in buffers) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers[i]);
            gl.bufferData(gl.ARRAY_BUFFER,
                          new Float32Array(data[i]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(attrL[i]);
            gl.vertexAttribPointer(attrL[i], attrS[i], gl.FLOAT, false, 0, 0);
        }
    }

    function noBlend() {
        if (withThreeJS) {
            state.setCullFace(THREE.CullFaceNone);
            state.setBlending(THREE.NoBlending);
        } else {
            gl.disable(gl.BLEND);
        }
    }

    function normalBlend() {
        if (withThreeJS) {
            state.setBlending(THREE.NormalBlending);
        } else {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
    }

    function oneBlend() {
        if (withThreeJS) {
            state.setBlending(THREE.CustomBlending, THREE.AddEquation, THREE.OneFactor, THREE.OneFactor);
        } else {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
        }
    }

    function textureCopy(obj, src, dst) {
        var w;
        var h;
        var readbuffer;
        var writebuffer;

        if (obj.constructor === Breed) {
            w = T;
            h = T;
            readbuffer = readFramebufferBreed;
            writebuffer = writeFramebufferBreed;
        } else if (obj.constructor === Patch) {
            w = FW;
            h = FH;
            readbuffer = readFramebufferPatch;
            writebuffer = writeFramebufferPatch;
        }

        renderer.setRenderTarget(readbuffer, gl.READ_FRAMEBUFFER);
        gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, src, 0);

        renderer.setRenderTarget(writebuffer, gl.DRAW_FRAMEBUFFER);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);

        gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        setTargetBuffer(null, null);
    }

    function updateOwnVariable(obj, name, type, optData) {
        var width;
        var height;
        var ary;
        if (obj.constructor === Breed) {
            var width = T;
            var height = T;
        } else if (obj.constructor === Patch) {
            var width = FW;
            var height = FH;
        } else {
            var width = VTW;
            var height = VTH;
        }

        if (obj[name]) {
            gl.deleteTexture(obj[name]);
        }
        if (obj[N + name]) {
            gl.deleteTexture(obj[N + name]);
        }

        obj.own[name] = [name, type];

        if (type == "float") {
            var ary = optData || new Float32Array(width * height);
            var format = gl.R32F;
        } else if (type == "vec2") {
            var ary = optData || new Float32Array(width * height * 2);
            var format = gl.RG32F;
        } else if (type == "vec3") {
            var ary = optData || new Float32Array(width * height * 3);
            var format = gl.RGB32F;
        } else if (type == "vec4") {
            var ary = optData || new Float32Array(width * height * 4);
            var format = gl.RGBA32F;
        }

        obj[name] = createTexture(ary, format, width, height);
        obj[N + name] = createTexture(ary, format, width, height);
    }

    function removeOwnVariable(obj, name) {
        delete obj.own[name];
        if (obj[name]) {
            gl.deleteTexture(obj[name]);
            delete obj[name];
        }
        if (obj[N + name]) {
            gl.deleteTexture(obj[N  + name]);
            delete obj[N + name];
        }
    }

    function update(cls, name, fields, env) {
        var stringify = (obj) => {
            var type = Object.prototype.toString.call(obj);
            if (type === "[object Object]") {
                var pairs = [];
                for (var k in obj) {
                    if (!obj.hasOwnProperty(k)) continue;
                    pairs.push([k, stringify(obj[k])]);
                }
                pairs.sort((a, b) => a[0] < b[0] ? -1 : 1);
                pairs = pairs.map(v => '"' + v[0] + '":' + v[1]);
                return "{" + pairs + "}";
            }
            if (type === "[object Array]") {
                return "[" + obj.map(v => stringify(v)) + "]";
            }
            return JSON.stringify(obj);
        };

        var obj = env.at(name);
        if (!obj) {
            obj = new cls();
            for (var i = 0; i < fields.length; i++) {
                updateOwnVariable(obj, fields[i][2], fields[i][3]);
            }
            env.atPut(name, obj);
            return true;
        }

        var oldOwn = obj.own;
        var toBeDeleted = [];  // [<str>]
        var toBeCreated = [];  // [[<str>, type]]
        var newOwn = {};

        // common case: when the existing own and fields are the same
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            var k = field[2];
            var type = field[3];
            newOwn[k] = [k, type];
        }
        if (stringify(newOwn) === stringify(oldOwn)) {
            return false;
        }

        function find(list, pair) {
            for (var i = 0; i < list.length; i++) {
                if (list[i][0] === pair[0] && list[i][1] === pair[1]) {
                    return i;
                }
            }
            return -1;
        }

        // other case: get things into toBeDeleted and toBeCreated, and toBeMoved
        for (var k in oldOwn) {
            if (find(fields, oldOwn[k]) < 0) {
                toBeDeleted.push(k)
            }
        }
        for (var i = 0; i < fields.length; i++) {
            var k = fields[i][2];
            var type = fields[i][3];
            if (!oldOwn[k]) {
                toBeCreated.push([k, type]);
            }
        }

        toBeCreated.forEach((pair) => updateOwnVariable(obj, pair[0], pair[1]));
        toBeDeleted.forEach((k) => removeOwnVariable(obj, k));
        return true;
    }

    function programFromEntry(entry, vert, frag, name) {
        return (function () {
            var debugName = name;
            if (debugName === "set") {
            }
            var prog = createProgram(createShader(name + ".vert", vert),
                                     createShader(name + ".frag", frag));
            var vao = breedVAO;
            var uniLocations = {};


            var forBreed = entry.forBreed;
            var viewportW = forBreed ? T : FW;
            var viewportH = forBreed ? T : FH;
            var hasPatchInput = entry.hasPatchInput;

            entry.defaultUniforms.forEach(function(n) {
                uniLocations[n] = gl.getUniformLocation(prog, n);
            });

            entry.uniformTable.keysAndValuesDo((key, info) => {
                var uni = entry.uniform(info[1], info[2]);
                uniLocations[uni] = gl.getUniformLocation(prog, uni);
            });

            entry.scalarParamTable.keysAndValuesDo((key, entry) => {
                var varName = entry[2];
                var uni = "u_scalar_" + varName;
                uniLocations[uni] = gl.getUniformLocation(prog, uni);
            });

            return function(objects, outs, ins, params) {
                // objects: {varName: object}
                // outs: [[varName, fieldName]]
                // ins: [[varName, fieldName]]
                // params: {shortName: value}
            if (debugName === "x") {
            }
                var object = objects["this"];

                var targetTypes = [];
                var targets = [];
                outs.forEach(
                    (triple) => {
                        targets.push(objects[triple[0]][N + triple[1]]);
                        targetTypes.push(triple[2]);
                    }
                );

                if (forBreed) {
                    setTargetBuffers(framebufferBreed, targets);
                } else {
                    outs.forEach((pair) => {
                        textureCopy(objects[pair[0]],
                                    objects[pair[0]][pair[1]],
                                    objects[pair[0]][N + pair[1]])});
                    setTargetBuffers(framebufferPatch, targets);
                }

                state.useProgram(prog);
                gl.bindVertexArray(vao);
                noBlend();

                if (!withThreeJS) {
                    gl.viewport(0, 0, viewportW, viewportH);
                }

                gl.uniform2f(uniLocations["u_resolution"], FW, FH);
                gl.uniform2f(uniLocations["u_half"], 0.5/viewportW, 0.5/viewportH);

                var offset = 0;
                if (!forBreed || hasPatchInput) {
                    //object.hasPos
                    if (true) {
                        state.activeTexture(gl.TEXTURE0);
                        state.bindTexture(gl.TEXTURE_2D, object.pos);
                        gl.uniform1i(uniLocations["u_that_xy"], 0);
                        offset = 1;
                    } else {
                        state.activeTexture(gl.TEXTURE0);
                        state.bindTexture(gl.TEXTURE_2D, object.x);
                        gl.uniform1i(uniLocations["u_that_x"], 0);
                        
                        state.activeTexture(gl.TEXTURE1);
                        state.bindTexture(gl.TEXTURE_2D, object.y);
                        gl.uniform1i(uniLocations["u_that_y"], 1);
                        offset = 2;
                    }
                }

                for (var ind = 0; ind < ins.length; ind++) {
                    var triple = ins[ind];
                    var glIndex = gl.TEXTURE0 + ind + offset;
                    var k = triple[1];
                    var val = objects[triple[0]][k];
                    state.activeTexture(glIndex);
                    state.bindTexture(gl.TEXTURE_2D, val);
                    gl.uniform1i(uniLocations["u" + "_" + triple[0] + "_" + k], ind + offset);
                }

                for (var k in params) {
                    var val = params[k];
                    if (val.constructor == WebGLTexture) {
                        var glIndex = gl.TEXTURE0 + ind + offset;
                        state.activeTexture(glIndex);
                        state.bindTexture(gl.TEXTURE_2D, val);
                        gl.uniform1i(uniLocations["u_vector_" + k], ind + offset);
                        ind++;
                    } else if (val.constructor == vec) {
                        switch(val.arity) {
                            case 1:
                            gl.uniform1f(uniLocations["u_scalar_" + k], val.x);
                            break;
                            case 2:
                            gl.uniform2f(uniLocations["u_scalar_" + k], val.x, val.y);
                            break;
                            case 3:
                            gl.uniform3f(uniLocations["u_scalar_" + k], val.x, val.y, val.z);
                            break;
                            case 4:
                            gl.uniform4f(uniLocations["u_scalar_" + k], val.x, val.y, val.z, val.w);
                            break;
                        }
                    }
                }

                gl.drawArrays(gl.POINTS, 0, object.count);
                gl.flush();
                setTargetBuffers(null, null);
                for (var i = 0; i < outs.length; i++) {
                    var triple = outs[i];
                    var o = objects[triple[0]];
                    var name = triple[1];
                    var tmp = o[name];
                    o[name] = o[N + name];
                    o[N + name] = tmp;
                }
                gl.bindVertexArray(null);
            }
        })();
    }

    function programFromTable3(table, vert, frag, name) {
        return (function () {
            var debugName = name;
            if (debugName === "setCoreColor") {
            }
            var prog = createProgram(createShader(name + ".vert", vert),
                                     createShader(name + ".frag", frag));
            var vao = breedVAO;
            var uniLocations = {};

            var forBreed = table.forBreed;
            var viewportW = forBreed ? T : VTW;
            var viewportH = forBreed ? T : VTH;
            var hasPatchInput = table.hasPatchInput;

            table.defaultUniforms.forEach(function(n) {
                uniLocations[n] = gl.getUniformLocation(prog, n);
            });

            table.uniformTable.keysAndValuesDo((key, entry) => {
                var uni = table.uniform(entry[1], entry[2]);
                uniLocations[uni] = gl.getUniformLocation(prog, uni);
            });

            table.scalarParamTable.keysAndValuesDo((key, entry) => {
                var name = entry[2];
                var uni = "u_scalar_" + name;
                uniLocations[uni] = gl.getUniformLocation(prog, uni);
            });

            return function(objects, outs, ins, params) {
                // objects: {varName: object}
                // outs: [[varName, fieldName]]
                // ins: [[varName, fieldName]]
                // params: {shortName: value}
                if (debugName === "setCoreColor") {
                }
                var object = objects["this"];

                var targets = outs.map(function(pair) {return objects[pair[0]][N + pair[1]]});
                if (forBreed) {
                    setTargetBuffers(framebufferBreed, targets);
                } else {
                    outs.forEach((pair) => {
                        textureCopy(objects[pair[0]],
                                    objects[pair[0]][pair[1]],
                                    objects[pair[0]][N + pair[1]])});
                    setTargetBuffers(framebufferPatch, targets);
                }

                state.useProgram(prog);
                gl.bindVertexArray(vao);
                noBlend();

                gl.uniform3f(uniLocations["u_resolution"], VW, VH, VD);
                gl.uniform3f(uniLocations["v_resolution"], VW/VS, VH/VS, VD/VS);
                gl.uniform1f(uniLocations["v_step"], VS);
                gl.uniform2f(uniLocations["u_half"], 0.5/viewportW, 0.5/viewportH);

                var offset = 0;
                if (!forBreed || hasPatchInput) {
                    state.activeTexture(gl.TEXTURE0);
                    state.bindTexture(gl.TEXTURE_2D, object.x);
                    gl.uniform1i(uniLocations["u_that_x"], 0);

                    state.activeTexture(gl.TEXTURE1);
                    state.bindTexture(gl.TEXTURE_2D, object.y);
                    gl.uniform1i(uniLocations["u_that_y"], 1);

                    state.activeTexture(gl.TEXTURE2);
                    state.bindTexture(gl.TEXTURE_2D, object.z);
                    gl.uniform1i(uniLocations["u_that_z"], 2);

                    offset = 3;
                }

                for (var ind = 0; ind < ins.length; ind++) {
                    var pair = ins[ind];
                    var glIndex = gl.TEXTURE0 + ind + offset;
                    var k = pair[1]
                    var val = objects[pair[0]][k];
                    state.activeTexture(glIndex);
                    state.bindTexture(gl.TEXTURE_2D, val);
                    gl.uniform1i(uniLocations["u" + "_" + pair[0] + "_" + k], ind + offset);
                }

                for (var k in params) {
                    var val = params[k];
                    if (val.constructor == WebGLTexture) {
                        var glIndex = gl.TEXTURE0 + ind + offset;
                        state.activeTexture(glIndex);
                        state.bindTexture(gl.TEXTURE_2D, val);
                        gl.uniform1i(uniLocations["u_vector_" + k], ind + offset);
                        ind++;
                    } else {
                        gl.uniform1f(uniLocations["u_scalar_" + k], val);
                    }
                }

                gl.drawArrays(gl.POINTS, 0, object.count);
                gl.flush();
                setTargetBuffers(null, null);
                for (var i = 0; i < outs.length; i++) {
                    var pair = outs[i];
                    var o = objects[pair[0]];
                    var name = pair[1];
                    var tmp = o[name];
                    o[name] = o[N + name];
                    o[N + name] = tmp;
                }
                gl.bindVertexArray(null);
            }
        })();
    }

    function initFramebuffers() {
        debugTextureBreed = createTexture(new Float32Array(T*T*4), gl.RGBA32F, T, T);
        debugTexturePatch = createTexture(new Float32Array(FW*FH*4), gl.RGBA32F, FW, FH);

        framebufferBreed = makeFramebuffer(gl.R32F, T, T);
        framebufferPatch = makeFramebuffer(gl.R32F, FW, FH);

        framebufferU8RGBA = makeFramebuffer(gl.RGBA, FW, FH);

        framebufferDiffuse = makeFramebuffer(gl.R32F, FW, FH);

        readFramebufferBreed = makeFramebuffer(gl.R32F, T, T);
        readFramebufferPatch = makeFramebuffer(gl.R32F, FW, FH);

        writeFramebufferBreed = makeFramebuffer(gl.R32F, T, T);
        writeFramebufferPatch = makeFramebuffer(gl.R32F, FW, FH);

        framebufferDBreed = makeFramebuffer(gl.RGBA32F, T, T);
        framebufferDPatch = makeFramebuffer(gl.RGBA32F, FW, FH);
    }

    function Shadama() {
        this.env = new ShadamaEnv();  // {name: ShadamaEvent}
        this.scripts = {};    // {name: [function, inOutParam]}
        this.statics = {};    // {name: function}
        this.staticsList = []; // [name];
        this.steppers = {};  // {name: name}
        this.triggers = {};  // {triggerName: ShadamaTrigger}
        this.loadTime = 0.0;

        this.compilation = null;
        this.setupCode = null;
        this.programName = null;

        this.readPixelArray = null;
        this.vec = vec;
    }

    Shadama.prototype.evalShadama = function(source) {
        // evaluates ohm compiled shadama code (js code) so that variables are
        // accessible inside the eval
        var env = this.env;
        var scripts = this.scripts;
        return eval(source);
    }

    Shadama.prototype.loadShadama = function(source) {
        var newSetupCode;
        var oldProgramName = this.programName;
        var schemaChange = false;
        this.statics = {};
        this.staticsList = [];
        this.scripts = {};
        this.triggers = {};
        var newData = [];
        this.cleanUpEditorState();
        try {
            var result = translate(source, "TopLevel", this.reportError.bind(this));
        } catch (e) {
            this.reportError(e);
            return;
        }
        this.compilation = result;

        if (!result) {return "";}
        var newProgramName = result["_programName"];
        if (oldProgramName != newProgramName) {
            this.resetSystem();
        }
        this.programName = newProgramName;
        delete result["_programName"];

        for (var k in result) {
            var item = result[k];
            var entry = item[0];
            var type = entry.type;
            var info = item[3];
            if (type === "static") {
                var js = item[1];
                var src = item[2];
                this.statics[k] = this.evalShadama(js);
                this.staticsList.push(k);
                this.env.atPut(k, new ShadamaFunction(k, this));
                if (k === "setup") {
                    newSetupCode = src;
                }
            }

            if (type === "breed") {
                schemaChange = update(Breed, k, entry.param.toArray(), this.env) || schemaChange;
            }
            if (type === "patch") {
                schemaChange = update(Patch, k, entry.param.toArray(), this.env) || schemaChange;
            }
            if (type == "method") {
                var func = dimension == 2 ? programFromEntry : programFromTable3;
                this.scripts[info] = [ func(entry, item[1], item[2], info),
                                       entry.insAndParamsAndOuts()];
            }
            if (type === "event") {
                this.env.atPut(k, new ShadamaEvent());
            }
            if (type === "trigger") {
                this.triggers[k] = new ShadamaTrigger(js[1], js[2]);
            }
            if (type === "data") {
                this.env.atPut(k, new ShadamaEvent());
                if (js[3] == "image") {
                    this.env.atPut(k, this.loadImage(js[2]));
                } else if (js[3] == "audio") {
                    this.env.atPut(k, this.loadAudio(js[2]));
                } else if (js[3] == "csv") {
                    this.env.atPut(k, this.loadCSV(js[2]));
                }
                
                if (newData.length == 0) {
                    newData = js[1];
                } else {
                    newData = ["and", js[1], newData];
                }
            }
        }

        if (this.setupCode !== newSetupCode) {
            schemaChange = true;
            this.setupCode = newSetupCode;
        }

        this.populateList(this.staticsList);

        // setup should be triggered in response to receicing 'load event',
        // but for now we keep the old way

        if (schemaChange) {
            if (newData.length === 0) {
                var success = this.callSetup();
                if (!success) {return };
            } else {
                var trigger = new ShadamaTrigger(newData, ["step", "setup"]);
                this.triggers["_trigger" + trigger.trigger.toString()] = trigger;
            }
        }
//        this.runLoop();
        return source;
    }

    Shadama.prototype.setTarget = function(aTexture) {
        targetTexture = aTexture;
    }

    function webglTexture() {
        return withThreeJS ? (targetTexture && renderer.properties.get(targetTexture).__webglTexture || null) : null;
    }

    Shadama.prototype.makeOnAfterRender = function() {
        return function(renderer, scene, camera, geometry, material, group) {
            var mesh = this;
            var pMatrix = camera.projectionMatrix;
            var mvMatrix = mesh.modelViewMatrix;
           // mvpMatrix.multiply(modelViewMatrix);

            for (var i = 0; i < renderRequests.length; i++) {
                var item = renderRequests[i];
                if (item.constructor == Breed || item.constructor == Patch) {
                    item.realRender(mvMatrix, pMatrix);
                }
            }
            renderRequests.length = 0;
        }
    }

    Shadama.prototype.readPixels = function() {
        var width = FW;
        var height = FH;

        if (!this.readPixelArray) {
            this.readPixelArray = new Uint8Array(width * height * 4);
        }
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, this.readPixelArray);

        var clamped = new Uint8ClampedArray(this.readPixelArray);
        var img = new ImageData(clamped, width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return img;
    }

    Shadama.prototype.debugDisplay = function(objName, name) {
        var object = this.env.at(objName);
        var forBreed = object.constructor == Breed;
        var width = forBreed ? T : FW;
        var height = forBreed ? T : FH;

        if (!debugCanvas1) {
            debugCanvas1 = document.getElementById("debugCanvas1");
            if (!debugCanvas1) {
                debugCanvas1 = document.createElement("canvas");
            }
            debugCanvas1.width = width;
            debugCanvas1.height = height;
            if (domTools) {
                document.body.appendChild(debugCanvas1);
            }
        }

        var prog = programs[forBreed ? "debugBreed" : "debugPatch"];

        if (forBreed) {
            setTargetBuffer(framebufferDBreed, debugTextureBreed);
        } else {
            setTargetBuffer(framebufferDPatch, debugTexturePatch);
        }

        state.useProgram(prog.program);
        gl.bindVertexArray(prog.vao);

        var tex = object[name];
        var type = object.own[name][1];

        state.activeTexture(gl.TEXTURE0);
        state.bindTexture(gl.TEXTURE_2D, tex);

        if (!withThreeJS) {
            gl.viewport(0, 0, width, height);
        }
        gl.uniform1i(prog.uniLocations["u_value"], 0);
        gl.uniform2f(prog.uniLocations["u_half"], 0.5/width, 0.5/height);

        if (withThreeJS) {
            renderer.setClearColor(new THREE.Color(0x000000));
            renderer.clearColor();
        } else {
            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        noBlend();

        gl.drawArrays(gl.POINTS, 0, width * height);
        gl.flush();

        debugArray = new Float32Array(width * height * 4);
        var scale;
        switch(type) {
            case "float":
            scale = 1;      break;
            case "vec2":
            scale = 2;      break;
            case "vec3":
            scale = 3;      break;
            case "vec4":
            scale = 4;      break;
        }

        debugArray1 = new Float32Array(width * height * scale);
        debugArray2 = new Uint8ClampedArray(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, debugArray, 0);

        for (var i = 0; i < width * height; i++) {
            var ind = i * scale;
            for (var j = 0; j < scale; j++) {
                debugArray1[ind + j] = debugArray[i * 4 + j];
            }
        }

        for (var i = 0; i < width * height; i++) {
            debugArray2[i * 4 + 0] = debugArray[i * 4 + 0] * 255;
            debugArray2[i * 4 + 1] = debugArray[i * 4 + 1] * 255;
            debugArray2[i * 4 + 2] = debugArray[i * 4 + 2] * 255;
            debugArray2[i * 4 + 3] = debugArray[i * 4 + 3] * 255;
        }

        var img = new ImageData(debugArray2, width, height);
        debugCanvas1.getContext("2d").putImageData(img, 0, 0);
        setTargetBuffer(null, null);

        gl.bindVertexArray(null);
        return debugArray1;
    }

    Shadama.prototype.readValues = function(object, name, x, y, w, h) {
        var forBreed = object.constructor == Breed;
        var maxWidth = forBreed ? T : FW;
        var maxHeight = forBreed ? T : FH;

        if (x < 0 || y < 0 || x >= maxWidth || y >= maxHeight
            || x + w >= maxWidth || y + h >= maxHeight) {
            var error = new Error("runtime error");
            error.reason = `coordiate is out of bounds`;
            error.expected = `coordiate is out of bounds`;
            error.pos = -1;
            error.src = null;
            throw error;
        }

        var prog = programs[forBreed ? "debugBreed" : "debugPatch"];

        if (forBreed) {
            setTargetBuffer(framebufferDBreed, debugTextureBreed);
        } else {
            setTargetBuffer(framebufferDPatch, debugTexturePatch);
        }

        state.useProgram(prog.program);
        gl.bindVertexArray(prog.vao);

        var tex = object[name];

        state.activeTexture(gl.TEXTURE0);
        state.bindTexture(gl.TEXTURE_2D, tex);

        if (!withThreeJS) {
            gl.viewport(0, 0, maxWidth, maxHeight);
        }
        gl.uniform1i(prog.uniLocations["u_value"], 0);
        gl.uniform2f(prog.uniLocations["u_half"], 0.5/maxWidth, 0.5/maxHeight);

        if (withThreeJS) {
            renderer.setClearColor(new THREE.Color(0x000000));
            renderer.clearColor();
        } else {
            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        noBlend();

        gl.drawArrays(gl.POINTS, 0, maxWidth * maxHeight);
        gl.flush();

        debugArray = new Float32Array(w * h * 4);
        debugArray1 = new Float32Array(w * h);
        gl.readPixels(x, y, w, h, gl.RGBA, gl.FLOAT, debugArray, 0);

        setTargetBuffer(null, null);
        gl.bindVertexArray(null);

        if (w == 1 && h == 1) {
            return debugArray[0];
        }

        for (var i = 0; i < w * h; i++) {
            debugArray1[i] = debugArray[i * 4 + 0];
        }

        return debugArray1;
    }

    Shadama.prototype.resetSystem = function() {
        for (var s in this.steppers) {
            var e = this.detectEntry(s);
            if (e) {
                this.stopClock(e.clock);
            }
        }
        this.removeAll();

        this.scripts = {};
        this.statics = {};
        this.steppers = {};
        this.setupCode = null;
        this.programName = null;

        renderRequests = [];

        for (var o in this.env.keys()) {
            var obj = this.env.at(o);
            if (typeof obj == "object" && (obj.constructor == Breed || obj.constructor == Patch)) {
                for (var k in obj.own) {
                    var tex = obj[k];
                    if (tex.constructor === WebGLTexture) {
                        gl.deleteTexture(obj[k]);
                    }
                }
                delete this.env.at(o);
            }
        }
    }

    Shadama.prototype.updateCode = function() {
        if (!editor) {return;}
        var code = editor.getValue();
        this.loadShadama(code);
        this.maybeRunner();
        if (!this.programName) {
            this.programName = prompt("Enter the program name:", "My Cool Effect!");
            if (!this.programName) {
                alert("program not saved");
                return;
            }
            code = "program " + '"' + this.programName + '"\n' + code;
            editor.setValue(code);
        }
        localStorage.setItem(this.programName + ".shadama", code);
        this.initFileList(this.programName);
    }

    Shadama.prototype.callSetup = function() {
        this.loadTime = window.performance.now() / 1000.0;
        this.env.atPut("time", 0.0);
        if (this.statics["setup"]) {
            try {
                this.statics["setup"](this.env);
            } catch (e) {
                this.reportError(e);
                return false;
            }
        }
        return true;
    }

    Shadama.prototype.addListeners = function(aCanvas) {
        if (!domTools) {return;}
        var that = this;
        var set = function(e, symbol) {
            var rect = aCanvas.getBoundingClientRect();
            var left = rect.left;
            var top = rect.top;
            var diffY = e.pageY - e.clientY;
            var diffX = e.pageX - e.clientX;
            var x = (e.clientX + diffX - left) / fullScreenScale;
            var y = FH - (e.clientY + diffY - top) / fullScreenScale;
            //  console.log("y " + e.clientY + " top " + top + " pageY: " + e.pageY);
            //  console.log("x " + x + " y: " + y);
            that.env.atPut(symbol, {x: x,  y: y, time: that.env["time"]});
        }

        aCanvas.addEventListener("mousemove", function(e) {
            set(e, "mousemove");
        });
        aCanvas.addEventListener("mousedown", function(e) {
            set(e, "mousedown");
        });
        aCanvas.addEventListener("mouseup", function(e) {
            set(e, "mouseup");
        });
        document.addEventListener('keypress', function(evt) {
            if (evt.target === document.body) {
                if (evt.key =='`') {
                    that.callSetup();
                } else if (evt.key == "\\") {
                    that.toggleScript("loop");
                }
            }
        }, true);
    }

    Shadama.prototype.initServerFiles = function() {
        if (!editor) {return;}
        var examples = [
            "1-Fill.shadama", "2-Disperse.shadama", "3-Gravity.shadama", "4-Two Circles.shadama", "5-Bounce.shadama", "6-Picture.shadama", "7-Duck Bounce.shadama", "8-Back and Forth.shadama", "9-Mandelbrot.shadama", "10-Life Game.shadama", "11-Ball Gravity.shadama", "12-Duck Gravity.shadama", "13-Ribbons.shadama", "16-Diffuse.shadama", "19-Bump.shadama"
        ];
        examples.forEach((n) => {
            this.env.at("Display").loadProgram(n, (serverCode) => {
                var localCode = localStorage.getItem(n);
                if (!localCode) {
                    localStorage.setItem(n, serverCode);
                }
                this.initFileList();
            })
        });
    }

    Shadama.prototype.loadAudio = function(name) {
        var event = new ShadamaEvent();
        var that = this;
        var location = window.location.toString();

        if (!audioContext) {
            audioContext = new AudioContext();
        }

        function loadSound(url) {
            var request = new XMLHttpRequest();
            request.open('GET', url, true);
            request.responseType = 'arraybuffer';

            // Decode asynchronously
            request.onload = function() {
                audioContext.decodeAudioData(request.response,
                                             function(buffer) {
                                                 event.setValue(buffer);
                                             },
                                             function(error) {
                                                 console.log(error);
                                                 event.setValue("");
                                             });
            }
            request.send();
        }

        if (location.startsWith("http")) {
            var slash = location.lastIndexOf("/");
            loadSound(location.slice(0, slash) + "/" + name);
        } else {
            loadSound("http://tinlizzie.org/~ohshima/shadama2/" + name);
        }
        return event;
    }

    Shadama.prototype.loadImage = function(name) {
        var event = new ShadamaEvent();
        var that = this;

        var img = document.createElement("img");
        var tmpCanvas = document.createElement("canvas");
        var location = window.location.toString();

        if (location.startsWith("http")) {
            if (frame) {
                var dir = frame.imagePath + name;
            } else {
                var slash = location.lastIndexOf("/");
                var dir = location.slice(0, slash) + "/" + name;
            }
            img.src = dir;
        } else {
            img.crossOrigin = "Anonymous";
            img.onerror = function() {
                console.log("no internet");
                var newImage = that.emptyImageData(256, 256);
                document.body.removeChild(img);
                event.setValue(newImage);
            }
            img.src = "http://tinlizzie.org/~ohshima/shadama2/" + name;
        }

        img.hidden = true;

        img.onload = function() {
            tmpCanvas.width = img.width;
            tmpCanvas.height = img.height;
            tmpCanvas.getContext('2d').drawImage(img, 0, 0);
            var newImage = tmpCanvas.getContext('2d').getImageData(0, 0, img.width, img.height);
            document.body.removeChild(img);
            event.setValue(newImage);
        }
        document.body.appendChild(img);
        return event;
    }

    Shadama.prototype.loadCSV = function(name) {
        var that = this;
        return (function() {
            var xobj = new XMLHttpRequest();
            var event = new ShadamaEvent();
            var location = window.location.toString();
            var dir;
            if (name.startsWith("http")) {
                dir = name;
            } else {
                if (location.startsWith("http")) {
                    if (frame) {
                        var dir = frame.dataPath + name;
                    } else {
                        var slash = location.lastIndexOf("/");
                        var dir = location.slice(0, slash) + "/" + name;
                    }
                } else {
                    dir = "http://tinlizzie.org/~ohshima/shadama2/" + name;
                }
            }
            xobj.open("GET", dir, true);
            xobj.responseType = "blob";
            
            xobj.onload = function(oEvent) {
                var blob = xobj.response;
                var file = new File([blob], dir);
                Papa.parse(file, {complete: resultCSV, error: errorCSV});
            };
            
            function errorCSV(error, file) {
                console.log("ERROR:", error, file);
                event.setValue("");
            }
            
            function resultCSV(result) {
                var data = result.data;
                event.setValue(data);
            }
            xobj.send();
            return event;
        })();
    }

    Shadama.prototype.initDisplay = function() {
        this.env.atPut("Display", new Display(this));
    }

    Shadama.prototype.initEnv = function(callback) {
        this.env.atPut("mousedown", {x: 0, y: 0});
        this.env.atPut("mousemove", {x: 0, y: 0});
        this.env.atPut("width", FW);
        this.env.atPut("height", FH);

        callback();
    }

    Shadama.prototype.makeClock = function() {
        var aClock = document.createElement("canvas");
        var that = this;
        aClock.width = 40;
        aClock.height = 40;
        aClock.ticking = false;
        aClock.hand = 0;
        drawClock(aClock, 0, false);

        aClock.onclick = function () {that.toggleScript(aClock.entry.scriptName)};

        return aClock;
    }

    Shadama.prototype.stopClock = function(aClock) {
        aClock.ticking = false;
        drawClock(aClock);
    }

    Shadama.prototype.startClock = function(aClock) {
        aClock.ticking = true;
        drawClock(aClock);
    }

    Shadama.prototype.stopScript = function(name) {
        delete this.steppers[name];
        var entry = this.detectEntry(name);
        if (entry) {
            this.stopClock(entry.clock);
        }
    }

    Shadama.prototype.startScript = function(name) {
        this.steppers[name] = name;
        var entry = this.detectEntry(name);
        if (entry) {
            this.startClock(entry.clock);
        }
    }

    Shadama.prototype.toggleScript = function(name) {
        if (this.steppers[name]) {
            this.stopScript(name);
        } else {
            this.startScript(name);
        }
    }

    function drawClock(aClock) {
        var hand = aClock.hand;
        var ticking = aClock.ticking;
        function drawFace(ctx, radius, backColor) {
            ctx.moveTo(0, 0);
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, 2*Math.PI);
            ctx.fillStyle = backColor;
            ctx.fill();

            ctx.strokeStyle = '#333';
            ctx.lineWidth = radius*0.1;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, radius*0.1, 0, 2*Math.PI);
            ctx.fillStyle = "#333";
            ctx.fill();
        };

        function drawHand(ctx, length, dir) {
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.moveTo(0, 0);
            ctx.rotate(dir);
            ctx.lineTo(0, -length);
            ctx.stroke();
        };

        var ctx = aClock.getContext('2d');
        var backColor = ticking ? '#ffcccc' : '#ffffff';
        var dir = hand / 360.0 * (Math.PI * 2.0);

        ctx.transform(1, 0, 0, 1, 18, 18);
        drawFace(aClock.getContext('2d'), 16, backColor);
        drawHand(aClock.getContext('2d'), 10, dir);
        ctx.resetTransform();
    }

    Shadama.prototype.makeEntry = function(name) {
        if (!domTools) {return;}
        var entry = document.createElement("div");
        var aClock = this.makeClock();
        var that = this;
        entry.scriptName = name;
        entry.appendChild(aClock);
        entry.clock = aClock;
        aClock.entry = entry;
        var button = document.createElement("div");
        button.className = "staticName";
        button.innerHTML = name;
        button.onclick = function() {
            that.env.atPut("time", (window.performance.now() / 1000) - that.loadTime);
            if (that.statics[entry.scriptName]) {
                try {
                    that.statics[entry.scriptName](that.env);
                } catch (e) {
                    that.reportError(e);
                }
            }
        };
        entry.appendChild(button);
        return entry;
    }

    Shadama.prototype.detectEntry = function(name) {
        if (!domTools) {return;}
        for (var j = 0; j < watcherList.children.length; j++) {
            var oldEntry = watcherList.children[j];
            if (oldEntry.scriptName === name) {return oldEntry;}
        }
        return null;
    }

    Shadama.prototype.removeAll = function() {
        if (!domTools) {return;}
        while (watcherList.firstChild) {
            watcherList.removeChild(watcherList.firstChild);
        }
    }

    Shadama.prototype.addAll = function(elems) {
        if (!domTools) {return;}
        for (var j = 0; j < elems.length; j++) {
            watcherList.appendChild(elems[j]);
        }
    }

    Shadama.prototype.updateClocks = function() {
        if (!domTools) {return;}
        for (var j = 0; j < watcherList.children.length; j++) {
            var child = watcherList.children[j];
            var aClock = child.clock;
            if (aClock.ticking) {
                aClock.hand = (aClock.hand + 2) % 360;
            }
            drawClock(aClock);
        }
    }

    Shadama.prototype.selectFile = function(dom) {
        if (dom.selectedIndex > 0) {// 0 is for the default label
            var option = dom.options[dom.selectedIndex];
            var name = option.label;
            var source = localStorage.getItem(name);
            if (source) {
                this.env.at("Display").clear();
                console.log("loading: " + name);
                this.resetSystem();
                this.loadShadama(source);
                if (editor) {
                    editor.doc.setValue(source);
                }
                this.maybeRunner();
            }
        }
    }

    Shadama.prototype.initFileList = function(optSelection) {
        var that = this;
        if (optSelection) {
            if (!optSelection.endsWith(".shadama")) {
                optSelection = optSelection + ".shadama";
            }
        }
        var dom = document.getElementById("myDropdown");
        dom.onchange = function() {that.selectFile(dom);};
        var selectIndex = null;
        if (localStorage) {
            var list = Object.keys(localStorage).filter((k) => k.endsWith(".shadama"));
            dom.options.length = 0;
            dom.options[0] = new Option("Choose a File:", 0);
            for(var i = 0; i < list.length; i++) {
                dom.options[dom.options.length] = new Option(list[i], i + 1);
                if (optSelection && list[i] === optSelection) {
                    selectIndex = i + 1;
                }
            }
            if (selectIndex) {
                dom.selectedIndex = selectIndex;
            }
        }
    }

    Shadama.prototype.updateEnv = function() {
        var that = this;
        function printNum(obj) {
            if (typeof obj !== "number") return obj;
            let str = Math.abs(obj) < 1 ? obj.toPrecision(3) : obj.toFixed(3);
            return str.replace(/\.0*$/, "");
        }
        function print(obj) {
            if (typeof obj !== "object") return printNum(obj);
            if (typeof obj == "object" && obj.constructor === ShadamaEvent) return print(obj.value);
            let props = Object.getOwnPropertyNames(obj)
                .filter((k)=>typeof obj[k] !== "object")
                .map((k)=>`${k}:${printNum(obj[k])}`);
            return `{${props.join(' ')}}`;
        }
        var list = Object.getOwnPropertyNames(that.env.keys())
            .sort()
//            .filter(filter)
            .map((k)=>`${k}: ${print(that.env.at(k))}`);
        if (envList) {
            envList.innerHTML = `<pre>${list.join('\n')}</pre>`;
        }
    }

    Shadama.prototype.populateList = function(newList) {
        if (!domTools) {return;}
        watcherElements = [];
        for (var i = 0; i < newList.length; i++) {
            var name = newList[i];
            var entry = this.detectEntry(name);
            if (!entry) {
                entry = this.makeEntry(name);
            }
            watcherElements.push(entry);
        }
        this.removeAll();
        this.addAll(watcherElements);
    }

    Shadama.prototype.addEnv = function(key, asset) {
        this.env.atPut(key, asset);
    }

    Shadama.prototype.runLoop = function() {
        if (this.statics["loop"]) {
            this.startScript("loop");
        }
    }

    Shadama.prototype.once = function(name) {
        if (this.statics[name]) {
            this.statics[name](this.env);
        }
    }

    Shadama.prototype.setEditor = function(anEditor, type) {
        editor = anEditor;
        editorType = type;
    }

    function Display(shadama) {
        this.shadama = shadama;
        if (withThreeJS) {
            this.clearColor = new THREE.Color(0xFFFFFFFF);
            this.otherColor = new THREE.Color(0x00000000);
        } else {
            this.clearColor = 'white';
        }
    }

    Display.prototype.clear = function() {
        var t = webglTexture();
        if (t) {
            setTargetBuffer(framebufferU8RGBA, t);
        } else {
            setTargetBuffer(null, null);
        }

        if (withThreeJS) {
            this.otherColor.copy(renderer.getClearColor());
            renderer.setClearColor(this.clearColor);
            renderer.clearColor();
            renderer.setClearColor(this.otherColor);
        } else {
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            gl.clearColor(1.0, 1.0, 1.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        if (!t) {
            setTargetBuffer(null, null);
        }
    }

    Display.prototype.playSound = function(buffer) {
        if (!buffer) {return}
        if (buffer.constructor === ShadamaEvent) {
            buffer = buffer.value;
        }
        var source = audioContext.createBufferSource(); // creates a sound source
        source.buffer = buffer;                    // tell the source which sound to play
        source.connect(audioContext.destination);       // connect the source to the context's destination (the speakers)
        source.start(0);                           // play the source now
    }

    Display.prototype.loadProgram = function(name, func) {
        var location = window.location.toString();
        if (!location.startsWith("http")) {return;}
        var slash = location.lastIndexOf("/");
        var dir = location.slice(0, slash) + "/" + "examples";
        var that = this;

        var file = dir + "/" + encodeURIComponent(name);
        var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                var serverCode = xhttp.responseText;
                if (func) {
                    func(serverCode);
                } else {
                    that.shadama.loadShadama(serverCode);
                    if (editor) {
                        editor.doc.setValue(serverCode);
                    }
                    that.shadama.maybeRunner();
                }
            }
        };
        xhttp.open("GET", file, true);
        xhttp.send();
    };

    Shadama.prototype.emptyImageData = function(width, height) {
        var ary = new Uint8ClampedArray(width * height * 4);
        for (var i = 0; i < width * height; i++) {
            ary[i * 4 + 0] = i;
            ary[i * 4 + 1] = 0;
            ary[i * 4 + 2] = 0;
            ary[i * 4 + 3] = 255;
        }
        return new ImageData(ary, 256, 256);
    }

    class StandAloneRenderer {
        setRenderTarget(framebuffer, optType) {
            gl.bindFramebuffer( optType || gl.FRAMEBUFFER, framebuffer );
        }
    }

    class Breed {
        constructor(count) {
            this.own = {};
            this.count = count || 0;
        }

        fillRandom(name, min, max) {
            var ary = new Float32Array(T * T);
            var range = max - min;
            for (var i = 0; i < ary.length; i++) {
                ary[i] = Math.random() * range + min;
            }
            updateOwnVariable(this, name, ary);
        }

        fillRandomDir(xName, yName) {
            var x = new Float32Array(T * T);
            var y = new Float32Array(T * T);
            for (var i = 0; i < x.length; i++) {
                var dir = Math.random() * Math.PI * 2.0;
                x[i] = Math.cos(dir);
                y[i] = Math.sin(dir);
            }
            updateOwnVariable(this, xName, x);
            updateOwnVariable(this, yName, y);
        }

        fillRandomDir3(xName, yName, zName) {
            var x = new Float32Array(T * T);
            var y = new Float32Array(T * T);
            var z = new Float32Array(T * T);
            for (var i = 0; i < x.length; i++) {
                var angleY = Math.random() * Math.PI * 2.0;
                var angleX = Math.asin(Math.random() * 2.0 - 1.0);
                x[i] = Math.sin(angleX);
                y[i] = Math.cos(angleX) * Math.cos(angleY);
                z[i] = Math.cos(angleX) * Math.sin(angleY);
            }
            updateOwnVariable(this, xName, x);
            updateOwnVariable(this, yName, y);
            updateOwnVariable(this, zName, z);
        }

        fillSpace(a1, a2, a3, a4) {
            //xName, yName, xDim, yDim
            var xName, yName, xDim, yDim;
            var type;
            if (typeof a1 == "string" && 
                typeof a2 == "string") {
                xName = a1;
                yName = a2;
                type = "float";
                if (typeof a3 == "object" && typeof a4 != "object") {
                    xDim = a3.x;
                    yDim = a3.y;
                } else if (typeof a3 == "float" && typeof a4 == "float") {
                    xDim = a3;
                    yDim = a4;
                } else if (typeof a3 == "object" && typeof a4 == "object") {
                    xDim = a3.x;
                    yDim = a4.x;
                }
            } else if (typeof a1 == "string" && typeof a2 == "object") {
                xName = a1;
                xDim = a2.x;
                yDim = a2.y;
                type = "vec2";
            }

            this.setCount(xDim * yDim);
            if (type == "float") {
                var x = new Float32Array(T * T);
                var y = new Float32Array(T * T);

                for (var j = 0; j < yDim; j++) {
                    for (var i = 0; i < xDim; i++) {
                        var ind = xDim * j + i;
                        x[ind] = i;
                        y[ind] = j;
                    }
                }
                updateOwnVariable(this, xName, "float", x);
                updateOwnVariable(this, yName, "float", y);
            } else {
                var xy = new Float32Array(T * T * 2);
                for (var j = 0; j < yDim; j++) {
                    for (var i = 0; i < xDim; i++) {
                        var ind = (xDim * j + i) * 2;
                        xy[ind] = i;
                        xy[ind+1] = j;
                    }
                }
                updateOwnVariable(this, xName, "vec2", xy);
            }
        }

        fillCuboid(xName, yName, zName, xDim, yDim, zDim, step) {
            this.setCount(xDim * yDim);
            var x = new Float32Array(T * T);
            var y = new Float32Array(T * T);
            var z = new Float32Array(T * T);

            var ind = 0;

            for (var l = 0; l < zDim; l += step) {
                for (var j = 0; j < yDim; j += step) {
                    for (var i = 0; i < xDim; i += step) {
                        x[ind] = i;
                        y[ind] = j;
                        z[ind] = l;
                        ind++;
                    }
                }
            }
            updateOwnVariable(this, xName, x);
            updateOwnVariable(this, yName, y);
            updateOwnVariable(this, zName, z);
        }

        fill(name, value) {
            var x = new Float32Array(T * T);

            for (var j = 0; j < this.count; j++) {
                x[j] = value;
            }
            updateOwnVariable(this, name, x);
        }

        fillImage(xName, yName, rName, gName, bName, aName, imagedata) {
            if (imagedata === undefined) {
                var error = new Error("runtime error");
                error.reason = `imagedata is not available`;
                error.expected = `imagedata is not available`;
                error.pos = -1;
                error.src = null;
                throw error;
            }
            if (imagedata.constructor === ShadamaEvent) {
                imagedata = imagedata.value;
            }
            var xDim = imagedata.width;
            var yDim = imagedata.height;
            this.fillSpace(xName, yName, xDim, yDim);

            var r = new Float32Array(T * T);
            var g = new Float32Array(T * T);
            var b = new Float32Array(T * T);
            var a = new Float32Array(T * T);

            for (var j = 0; j < yDim; j++) {
                for (var i = 0; i < xDim; i++) {
                    var src = j * xDim + i;
                    var dst = (yDim - 1 - j) * xDim + i;
                    r[dst] = imagedata.data[src * 4 + 0] / 255.0;
                    g[dst] = imagedata.data[src * 4 + 1] / 255.0;
                    b[dst] = imagedata.data[src * 4 + 2] / 255.0;
                    a[dst] = imagedata.data[src * 4 + 3] / 255.0;
                }
            }
            updateOwnVariable(this, rName, r);
            updateOwnVariable(this, gName, g);
            updateOwnVariable(this, bName, b);
            updateOwnVariable(this, aName, a);
        }

        loadData(data) {
            // assumes that the first line is the schema of the table
            if (data.constructor === ShadamaEvent) {
                data = data.value;
            }
            var schema = data[0];

            for (var k in this.own) {
                var ind = schema.indexOf(k);
                if (ind >= 0) {
                    var ary = new Float32Array(T * T);
                    for (var i = 1; i < data.length; i++) {
                        ary[i - 1] = data[i][ind];
                    }
                    updateOwnVariable(this, k, ary);
                }
                this.setCount(data.length - 1);
            }
        }

        draw() {
            var prog = programs["drawBreedVec"];
            var t = webglTexture();

            if (t) {
                setTargetBuffer(framebufferU8RGBA, t);
            } else {
                setTargetBuffer(null, null);
            }

            state.useProgram(prog.program);
            gl.bindVertexArray(prog.vao);

            normalBlend();

            state.activeTexture(gl.TEXTURE0);
            state.bindTexture(gl.TEXTURE_2D, this.pos);
            gl.uniform1i(prog.uniLocations["u_xy"], 0);

            state.activeTexture(gl.TEXTURE1);
            state.bindTexture(gl.TEXTURE_2D, this.color);
            gl.uniform1i(prog.uniLocations["u_c"], 1);

            if (!withThreeJS) {
                gl.viewport(0, 0, FW, FH);
            }
            gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
            gl.uniform2f(prog.uniLocations["u_half"], 0.5/FW, 0.5/FH);

            gl.drawArrays(gl.POINTS, 0, this.count);
            gl.flush();

            noBlend();

            if (!t) {
                setTargetBuffer(null, null);
            }
            gl.bindVertexArray(null);
        }

        render() {
            renderRequests.push(this);
        }

        realRender(mvMatrix, pMatrix) {
            var prog = programs["renderBreed"];
            var breed = this;
            var uniLocations = prog.uniLocations;

            state.useProgram(prog.program);
            gl.bindVertexArray(prog.vao);

            normalBlend();

            state.activeTexture(gl.TEXTURE0);
            state.bindTexture(gl.TEXTURE_2D, breed.x);
            gl.uniform1i(prog.uniLocations["u_x"], 0);

            state.activeTexture(gl.TEXTURE1);
            state.bindTexture(gl.TEXTURE_2D, breed.y);
            gl.uniform1i(prog.uniLocations["u_y"], 1);

            state.activeTexture(gl.TEXTURE2);
            state.bindTexture(gl.TEXTURE_2D, breed.z);
            gl.uniform1i(prog.uniLocations["u_z"], 2);

            state.activeTexture(gl.TEXTURE3);
            state.bindTexture(gl.TEXTURE_2D, breed.r);
            gl.uniform1i(prog.uniLocations["u_r"], 3);

            state.activeTexture(gl.TEXTURE4);
            state.bindTexture(gl.TEXTURE_2D, breed.g);
            gl.uniform1i(prog.uniLocations["u_g"], 4);

            state.activeTexture(gl.TEXTURE5);
            state.bindTexture(gl.TEXTURE_2D, breed.b);
            gl.uniform1i(prog.uniLocations["u_b"], 5);

            state.activeTexture(gl.TEXTURE6);
            state.bindTexture(gl.TEXTURE_2D, breed.a);
            gl.uniform1i(prog.uniLocations["u_a"], 6);

            var maybeD = breed["d"];
            if (maybeD !== undefined) {
                if (typeof maybeD == "float") {
                    gl.uniform1i(prog.uniLocations["u_use_vector"], 0);
                    gl.uniform1f(prog.uniLocations["u_dotSize"], maybeD);
                    gl.uniform1i(prog.uniLocations["u_d"], 0);
                } else {
                    state.activeTexture(gl.TEXTURE7);
                    state.bindTexture(gl.TEXTURE_2D, maybeD);
                    gl.uniform1i(prog.uniLocations["u_d"], 7);

                    gl.uniform1i(prog.uniLocations["u_use_vector"], 1);
                    gl.uniform1f(prog.uniLocations["u_dotSize"], 0);
                }
            } else {
                gl.uniform1i(prog.uniLocations["u_use_vector"], 0);
                gl.uniform1f(prog.uniLocations["u_dotSize"], 16);
                gl.uniform1i(prog.uniLocations["u_d"], 0);
            }

            gl.uniformMatrix4fv(uniLocations["mvMatrix"], false, mvMatrix.elements);
            gl.uniformMatrix4fv(uniLocations["pMatrix"], false, pMatrix.elements);
            gl.uniform3f(prog.uniLocations["u_resolution"], VW, VH, VD);
            gl.uniform3f(prog.uniLocations["u_half"], 0.5/VW, 0.5/VH, 0.5/VD);

            gl.drawArrays(gl.POINTS, 0, this.count);
            gl.flush();
            noBlend();

            gl.bindVertexArray(null);
        }

        increasePatch(patch, name, valueOrSrcName) {
            var prog = programs["increasePatch"];

            var src = patch[name];
            var dst = patch[N + name];
            textureCopy(patch, src, dst);
            setTargetBuffer(framebufferDiffuse, dst);

            var uniLocations = prog.uniLocations;

            state.useProgram(prog.program);
            gl.bindVertexArray(prog.vao);

            oneBlend();

            state.activeTexture(gl.TEXTURE0);
            state.bindTexture(gl.TEXTURE_2D, this.x);
            gl.uniform1i(uniLocations["u_that_x"], 0);

            state.activeTexture(gl.TEXTURE1);
            state.bindTexture(gl.TEXTURE_2D, this.y);
            gl.uniform1i(uniLocations["u_that_y"], 1);

            gl.uniform2f(uniLocations["u_resolution"], FW, FH);
            gl.uniform2f(uniLocations["u_half"], 0.5/FW, 0.5/FH);

            if (typeof valueOrSrcName === "string") {
                state.activeTexture(gl.TEXTURE2);
                state.bindTexture(gl.TEXTURE_2D, this[valueOrSrcName]);
                gl.uniform1i(prog.uniLocations["u_texture"], 2);
                gl.uniform1i(prog.uniLocations["u_use_vector"], 1);
            } else {
                gl.uniform1i(prog.uniLocations["u_texture"], 0);
                gl.uniform1i(prog.uniLocations["u_use_vector"], 0);
                gl.uniform1f(prog.uniLocations["u_value"], valueOrSrcName);
            }

            if (!withThreeJS) {
                gl.viewport(0, 0, FW, FH);
            }

            gl.drawArrays(gl.POINTS, 0, this.count);
            gl.flush();

            normalBlend();

            setTargetBuffer(null, null);
            gl.bindVertexArray(null);

            patch[name] = dst;
            patch[N + name] = src;
        }

        increaseVoxel(patch, name, valueOrSrcName) {
            var prog = programs["increaseVoxel"];

            var src = patch[name];
            var dst = patch[N + name];
            textureCopy(patch, src, dst);
            setTargetBuffer(framebufferDiffuse, dst);

            var uniLocations = prog.uniLocations;

            state.useProgram(prog.program);
            gl.bindVertexArray(prog.vao);

            oneBlend();

            state.activeTexture(gl.TEXTURE0);
            state.bindTexture(gl.TEXTURE_2D, this.x);
            gl.uniform1i(uniLocations["u_that_x"], 0);

            state.activeTexture(gl.TEXTURE1);
            state.bindTexture(gl.TEXTURE_2D, this.y);
            gl.uniform1i(uniLocations["u_that_y"], 1);

            state.activeTexture(gl.TEXTURE2);
            state.bindTexture(gl.TEXTURE_2D, this.z);
            gl.uniform1i(uniLocations["u_that_z"], 2);

            gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
            gl.uniform3f(prog.uniLocations["v_resolution"], VW/VS, VH/VS, VD/VS);
            gl.uniform1f(prog.uniLocations["v_step"], VS);
            gl.uniform2f(uniLocations["u_half"], 0.5/FW, 0.5/FH);

            if (typeof valueOrSrcName === "string") {
                state.activeTexture(gl.TEXTURE3);
                state.bindTexture(gl.TEXTURE_2D, this[valueOrSrcName]);
                gl.uniform1i(prog.uniLocations["u_texture"], 3);
                gl.uniform1i(prog.uniLocations["u_use_vector"], 1);
            } else {
                gl.uniform1i(prog.uniLocations["u_texture"], 0);
                gl.uniform1i(prog.uniLocations["u_use_vector"], 0);
                gl.uniform1f(prog.uniLocations["u_value"], valueOrSrcName);
            }

            if (!withThreeJS) {
                gl.viewport(0, 0, FW, FH);
            }

            gl.drawArrays(gl.POINTS, 0, this.count);
            gl.flush();

            normalBlend();

            setTargetBuffer(null, null);
            gl.bindVertexArray(null);

            patch[name] = dst;
            patch[N + name] = src;
        }

        readValues(n, x, y, w, h) {
            var val = shadama.readValues(this, n, x, y, w, h);
            return new ShadamaEvent().setValue(val);
        }

        setCount(n) {
            var oldCount = this.count;
            if (typeof n != "number") { //vec
                n = n.x;
            }
            if (n < 0 || !n) {
                n = 0;
            }
            this.count = n;
        }
    }

    class Patch {
        constructor() {
            this.own = {};
        }

        draw() {
            var prog = programs["drawPatch"];
            var t = webglTexture();

            if (t) {
                setTargetBuffer(framebufferU8RGBA, t);
            } else {
                setTargetBuffer(null, null);
            }

            state.useProgram(prog.program);
            gl.bindVertexArray(prog.vao);

            normalBlend();

            state.activeTexture(gl.TEXTURE0);
            state.bindTexture(gl.TEXTURE_2D, this.r);
            gl.uniform1i(prog.uniLocations["u_r"], 0);

            state.activeTexture(gl.TEXTURE0 + 1);
            state.bindTexture(gl.TEXTURE_2D, this.g);
            gl.uniform1i(prog.uniLocations["u_g"], 1);

            state.activeTexture(gl.TEXTURE0 + 2);
            state.bindTexture(gl.TEXTURE_2D, this.b);
            gl.uniform1i(prog.uniLocations["u_b"], 2);

            state.activeTexture(gl.TEXTURE0 + 3);
            state.bindTexture(gl.TEXTURE_2D, this.a);
            gl.uniform1i(prog.uniLocations["u_a"], 3);

            if (!withThreeJS) {
                gl.viewport(0, 0, FW, FH);
            }
            gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
            gl.uniform2f(prog.uniLocations["u_half"], 0.5/FW, 0.5/FH);

            gl.drawArrays(gl.POINTS, 0, FW * FH);
            gl.flush();

            noBlend();

            if (!t) {
                setTargetBuffer(null, null);
            }

            gl.bindVertexArray(null);
        }

        render() {
            renderRequests.push(this);
        }

        realRender(mvMatrix, pMatrix) {
            var prog = programs["renderPatch"];
            var t = webglTexture();

            if (t) {
                setTargetBuffer(framebufferU8RGBA, t);
            } else {
                setTargetBuffer(null, null);
            }

            var uniLocations = prog.uniLocations;

            state.useProgram(prog.program);
            gl.bindVertexArray(prog.vao);

            normalBlend();

            state.activeTexture(gl.TEXTURE0);
            state.bindTexture(gl.TEXTURE_2D, this.r);
            gl.uniform1i(prog.uniLocations["u_r"], 0);

            state.activeTexture(gl.TEXTURE0 + 1);
            state.bindTexture(gl.TEXTURE_2D, this.g);
            gl.uniform1i(prog.uniLocations["u_g"], 1);

            state.activeTexture(gl.TEXTURE0 + 2);
            state.bindTexture(gl.TEXTURE_2D, this.b);
            gl.uniform1i(prog.uniLocations["u_b"], 2);

            state.activeTexture(gl.TEXTURE0 + 3);
            state.bindTexture(gl.TEXTURE_2D, this.a);
            gl.uniform1i(prog.uniLocations["u_a"], 3);

            gl.uniformMatrix4fv(uniLocations["mvMatrix"], false, mvMatrix.elements);
            gl.uniformMatrix4fv(uniLocations["pMatrix"], false, pMatrix.elements);
            gl.uniform3f(prog.uniLocations["u_resolution"], VW, VH, VD);
            gl.uniform3f(prog.uniLocations["v_resolution"], VW/VS, VH/VS, VD/VS);
            gl.uniform1i(prog.uniLocations["v_step"], VS);
            gl.uniform3f(prog.uniLocations["u_half"], 0.5/VW, 0.5/VH, 0.5/VD);

            gl.drawArrays(gl.POINTS, 0, VTW * VTH);
            gl.flush();

            noBlend();

            if (!t) {
                setTargetBuffer(null, null);
            }

            gl.bindVertexArray(null);
        }

        diffuse(name) {
            var prog = programs["diffusePatch"];
            var src = this[name];
            var dst = this[N + name];

            setTargetBuffer(framebufferDiffuse, dst);

            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                console.log("incomplete framebuffer");
            }

            var uniLocations = prog.uniLocations;

            state.useProgram(prog.program);
            gl.bindVertexArray(prog.vao);

            noBlend();

            state.activeTexture(gl.TEXTURE0);
            state.bindTexture(gl.TEXTURE_2D, src);
            gl.uniform1i(prog.uniLocations["u_value"], 0);

            if (!withThreeJS) {
                gl.viewport(0, 0, FW, FH);
            }

            gl.uniform2f(prog.uniLocations["u_half"], 0.5/FW, 0.5/FH);

            gl.drawArrays(gl.POINTS, 0, FW * FH);
            gl.flush();

            setTargetBuffer(null, null);
            gl.bindVertexArray(null);

            this[name] = dst;
            this[N + name] = src;
        }

        readValues(n, x, y, w, h) {
            var val = shadama.readValues(this, n, x, y, w, h);
            return new ShadamaEvent().setValue(val);
        }
    }

    Shadama.prototype.cleanUpEditorState = function() {
        if (editor) {
            if (editorType == "CodeMirror") {
                if (parseErrorWidget) {
                    editor.removeLineWidget(parseErrorWidget);
                    parseErrorWidget = undefined;
                }
                editor.getAllMarks().forEach(function(mark) { mark.clear(); });
            }
            if (editorType == "Carota") {
                if (parseErrorWidget) {
                    parseErrorWidget.visible(false);
                }
            }
        }
    }

    var showError;

    Shadama.prototype.reportError = function(error) {
        function toDOM(x) {
            if (x instanceof Array) {
                var xNode = document.createElement(x[0]);
                x.slice(1)
                    .map(toDOM)
                    .forEach(yNode => xNode.appendChild(yNode));
                return xNode;
            } else {
                return document.createTextNode(x);
            }
        };

        if (editor) {
            if (editorType == "CodeMirror") {
                if (error.message != "runtime error") {
                    setTimeout(
                        function() {
                            var msg = error.expected;
                            var pos = error.pos;
                            var src = error.src;
                            if ((!src || editor.getValue() === src) && !parseErrorWidget) {
                                function repeat(x, n) {
                                    var xs = [];
                                    while (n-- > 0) {
                                        xs.push(x);
                                    }
                                    return xs.join('');
                                }
                                var docPos = editor.doc.posFromIndex(pos);
                                var widget = toDOM(['parseerror', repeat(' ', docPos.ch) + '^\n' + msg]);
                                if (pos && msg) {
                                    console.log(pos, msg);
                                } else {
                                    console.log(error);
                                }
                                parseErrorWidget = editor.addLineWidget(docPos.line, widget);
                            }
                        },
                        2500
                    );
                } else {
                    for (var n in this.steppers) {
                        this.stopScript(n);
                    }
                    alert(error.expected);
                }
            }
            if (editorType == "Carota") {
                var scale = 8; // need to compute it
                var bounds2D = editor.editor.byOrdinal(error.pos).bounds();
                var x = (bounds2D.r - (editor.width / 2)) / scale;
                var y = (editor.height - bounds2D.b - editor.height / 2) / scale;
                var vec = new THREE.Vector3(x, y, 0);
                var orig = vec.clone();
                editor.parent.localToWorld(vec);

                var msg = 'Expected: ' + error.msg;

                if (!parseErrorWidget) {
                    parseErrorWidget =
                        new TStickyNote(frame.tAvatar,
                            function(tObj){
                                //tObj.position.set(5, -2, -2);
                                //tObj.setLaser();
                                showError(tObj, msg, vec);}, 512, 256);
                    frame.sticky = parseErrorWidget;
                    parseErrorWidget.scale.set(0.05, 0.05, 0.05);
                } else {
                    showError(parseErrorWidget, msg, vec);
                }
            }
        } else {
            var msg = error.expected;
            var pos = error.pos;
            var src = error.src;
            if (pos && msg) {
                console.log(pos, msg);
            } else {
                console.log(error);
            }
        }
    }

    Shadama.prototype.setShowError = function(func) {
        showError = func;
    }

    showError = function(obj, m, v) {
        obj.visible(true);

        frame.mylaser = obj.laserBeam;
        frame.tAvatar.addChild(obj);
        obj.position.set(30, 10, -40);
        obj.quaternion.set(0,0,0,1);

        var canvas = obj.material.map.image;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "60px Arial";
        ctx.fillStyle = "blue";
        ctx.fillText(m, 5, 20);
        obj.material.map.needsUpdate = true;
        obj.release();

        obj.track(v);
    }

    Shadama.prototype.step = function() {
        this.env.atPut("time", (window.performance.now() / 1000) - this.loadTime);
        for (var k in this.triggers) {
            this.triggers[k].maybeFire(this);
        }
        try {
            for (var k in this.steppers) {
                var func = this.statics[k];
                if (func) {
                    func(this.env);
                }
            }
        } catch(e) {
            this.reportError(e);
        }
    }

    Shadama.prototype.maybeRunner = function(optFunc) {
        if (!animationRequested) {
            this.runner(optFunc);
        }
    }

    Shadama.prototype.runner = function(optFunc) {
        var that = this;

        function runBody() {
            if (domTools) {
                animationRequested = false;
                var start = performance.now();
                that.step();
                var now = performance.now();
                times.push({start: start, step: now - start});
                
                if ((times.length > 0 && now - times[0].start > 1000) || times.length === 2) {
                    while (times.length > 1 && now - times[0].start > 500) { times.shift() };
                    var frameTime = (times[times.length-1].start - times[0].start) / (times.length - 1);
                    var stepTime = times.reduce((a, b) => ({step: a.step + b.step})).step / times.length;
                    readout.innerHTML = "" + frameTime.toFixed(1) + " msecs/frame (" + (1000 / frameTime).toFixed(1) + " fps)";
                    that.updateEnv();
                }
                
                that.updateClocks();

                if (optFunc) {
                    optFunc();
                }
                if (keepGoing) {
                    window.requestAnimationFrame(runBody);
                    animationRequested = true;
                } else {
                    keepGoing = true;
                }
            }
        };
        runBody();
    }

    Shadama.prototype.destroy = function() {
        if (editorType == "Carota") {
            if (parseErrorWidget) {
                parseErrorWidget.removeSelf();
            }
        }
        //
    }

    Shadama.prototype.pause = function() {
        this.steppers = {};
    }

    Shadama.prototype.pointermove = function(x, y) {
        this.env.atPut("mousemove", {x: x, y: y});
    }

    Shadama.prototype.pointerup = function(x, y) {
        this.env.atPut("mouseup", {x: x, y: y});
    }

    Shadama.prototype.pointerdown = function(x, y) {
        this.env.atPut("mousedown", {x: x, y: y});
    }

    Shadama.prototype.tester = function() {
        return {
            shadama: this,
            parse: parse,
            Entry: Entry,
            update: update,
            translate: translate,
            s: s,
            Breed: Breed,
            Patch: Patch,
        }
    }

    Shadama.prototype.goFullScreen = function() {

        var req = shadamaCanvas.requestFullscreen || shadamaCanvas.webkitRequestFullscreen ||
            shadamaCanvas.mozRequestFullScreen || shadamaCanvas.msRequestFullscreen;

        if (req) {
            req.call(shadamaCanvas);

            function fsChanged() {
                if (document.fullscreenElement ||
                        document.webkitFullscreenElement ||
                        document.mozFullScreenElement ||
                        document.msFullscreenElement) {
                    var rx = window.innerWidth / FW;
                    var ry = window.innerHeight / FH;
                    fullScreenScale = Math.min(rx, ry);
                    shadamaCanvas.style.width = FW * fullScreenScale + 'px';
                    shadamaCanvas.style.height = FH * fullScreenScale + 'px';
                } else {
                    fullScreenScale = 1.0;
                    shadamaCanvas.style.width = FW + 'px';
                    shadamaCanvas.style.height = FH + 'px';
                }
            };

            document.addEventListener("fullscreenchange", fsChanged);
            document.addEventListener("webkitfullscreenchange", fsChanged);
            document.addEventListener("mozfullscreenchange", fsChanged);
            document.addEventListener("MSFullscreenChange", fsChanged);
        }
    }

    var shadamaGrammar = String.raw`
Shadama {
  TopLevel
    = ProgramDecl? (Breed | Patch | Event | On | Data | Method | Helper | Static)*

  ProgramDecl = program string
  Breed = breed ident "(" Formals ")"
  Patch = patch ident "(" Formals ")"
  Event = event ident
  On = on TriggerExpression arrow ident
  Data = data ident "(" string "," string ")"
  Method = def ident "(" Formals ")" Block
  Helper = helper TypedVar "(" Formals ")" Block
  Static = static ident "(" Formals ")" Block

  Formals
    = TypedVar ("," TypedVar)* -- list
    | empty

  Block = "{" StatementList "}"

  StatementList = Statement*

  Statement
    = Block
    | VariableStatement
    | AssignmentStatement
    | IfStatement
    | ExpressionStatement
    | ReturnStatement

  VariableStatement = var VariableDeclaration ";"?
  VariableDeclaration = ident ColonType? Initialiser?
  Initialiser = "=" Expression

  ReturnStatement = return Expression ";"?

  ExpressionStatement = Expression ";"?
  IfStatement = if "(" Expression ")" Statement (else Statement)?

  AssignmentStatement
    = LeftHandSideExpression "=" Expression ";"?

  LeftHandSideExpression
    = ident "." ident -- field
    | ident           -- ident

  TriggerExpression = 
    | TriggerExpression "&&" ident                      -- and
    | TriggerExpression "||" ident                      -- or
    | ident

  Expression = LogicalExpression

  LogicalExpression
    = LogicalExpression "&&" RelationalExpression       -- and
    | LogicalExpression "||" RelationalExpression       -- or
    | RelationalExpression

  RelationalExpression
    = RelationalExpression "<=" AddExpression          -- le
    | RelationalExpression ">=" AddExpression          -- ge
    | RelationalExpression "<" AddExpression           -- lt
    | RelationalExpression ">" AddExpression           -- gt
    | RelationalExpression "==" AddExpression          -- equal
    | RelationalExpression "!=" AddExpression          -- notEqual
    | AddExpression

  AddExpression
    = AddExpression "+" MulExpression  -- plus
    | AddExpression "-" MulExpression -- minus
    | MulExpression

  MulExpression
    = MulExpression "*" PrimExpression  -- times
    | MulExpression "/" PrimExpression  -- divide
    | MulExpression "%" PrimExpression  -- mod
    | UnaryExpression

  UnaryExpression
    = "+" PrimExpression -- plus
    | "-" PrimExpression -- minus
    | "!" PrimExpression -- not
    | PrimExpression

  PrimExpression
    = "(" Expression ")"  -- paren
    | PrimitiveCall
    | MethodCall
    | PrimExpression "." ident ColonType?    -- field
    | ident               -- variable
    | string              -- string
    | number              -- number

  PrimitiveCall
    = ident "(" Actuals ")"

  MethodCall
    = ident "." ident "(" Actuals ")"

  Actuals
    = Expression ("," Expression)* -- list
    | empty

  TypedVar = ident ColonType

  ColonType
    = ":" TypeName

  TypeName = float | vec2 | vec3 | vec4 | mat2 | mat3 | mat4 | object

  ident
    = letter (alnum | "_")*

  number
    = digit* "." digit+  -- fract
    | digit+             -- whole

  string = "\"" doubleStringCharacter* "\""

  doubleStringCharacter
    = "\\" any           -- escaped
    | ~"\"" any          -- nonEscaped

  identifierStart = letter | "_"
  identifierPart = identifierStart | digit

  var = "var" ~identifierPart
  if = "if" ~identifierPart
  breed = "breed" ~identifierPart
  patch = "patch" ~identifierPart
  else = "else" ~identifierPart
  def = "def" ~identifierPart
  helper = "helper" ~identifierPart
  this = "this" ~identifierPart
  static = "static" ~identifierPart
  program = "program" ~identifierPart
  return = "return" ~identifierPart
  event = "event" ~identifierPart
  on = "on" ~identifierPart
  data = "data" ~identifierPart

  float = "float" ~identifierPart
  vec2 = "vec2" ~identifierPart
  vec3 = "vec3" ~identifierPart
  vec4 = "vec4" ~identifierPart
  mat2 = "mat2" ~identifierPart
  mat3 = "mat3" ~identifierPart
  mat4 = "mat4" ~identifierPart
  object = "object" ~identifierPart

  arrow = "=>"

  empty =
  space
   += "//" (~nl any)* nl  -- cppComment
    | "/*" (~"*/" any)* "*/" -- cComment
  nl = "\n"
}
`;

    var g;
    var s;

    var globalTable; // This is a bad idea but then I don't know how to keep the reference to global.
    var primitives; // {Receiver: {selector: [[[name, type], ...]]}}

    function initPrimitiveTable() {
        var data = [
            ["Display", "clear", []],
            ["breed", "draw", []],
            ["patch", "draw", []],
            ["breed", "render", []],
            ["patch", "render", []],
            ["breed", "setCount", [["count", "float"]]],
            ["breed", "fillRandom", [["name", "string"], ["min", "float"], ["max", "float"]]],
            ["breed", "fillRandomDir", [["xDir", "string"], ["yDir", "string"]]],
            ["breed", "fillRandomDir", [["xyDir", "string"]]],

            ["breed", "fillRandomDir3", [["xDir", "string"], ["yDir", "string"], ["zDir", "string"]]],
            ["breed", "fillRandomDir3", [["xyzDir", "string"]]],

            ["breed", "fillSpace", [["xName", "string"],
                                    ["yName", "string"],
                                    ["x", "float"],
                                    ["y", "float"]]],
            ["breed", "fillSpace", [["xyName", "string"],
                                    ["xy", "vec2"]]],

            ["breed", "fillCuboid", [["xName", "string"],
                                     ["yName", "string"],
                                     ["zName", "string"],
                                     ["x", "float"],
                                     ["y", "float"],
                                     ["z", "float"]]],
            ["breed", "fillCuboid", [["xyzName", "string"],
                                     "xyz", "vec3"]],

            ["breed", "fillImage", [["xName", "string"],
                                    ["yName", "string"],
                                    ["rName", "string"],
                                    ["gName", "string"],
                                    ["bName", "string"],
                                    ["aName", "string"],
                                    ["imageData", "object"]]],
            ["display", "playSound", ["name", "object"]],
            ["display", "loadProgram", [["name", "string"]]],
            ["breed", "loadData", ["data", "object"]],
            ["breed", "readValues", [["name", "string"],
                                     ["x", "float"],
                                     ["y", "float"],
                                     ["w", "float"],
                                     ["h", "float"]]],
            ["static", "start", []],
            ["static", "stop", []],
            ["static", "step", []]];

        primitives = {};

        for (var k in data) {
            var ary = data[k];
            var obj = ary[0];
            var sel = ary[1];
            var args = ary[2];

            if (!primitives[obj]) {
                primitives[obj] = {};
            }
            if (!primitives[obj][sel]) {
                primitives[obj][sel] = [];
            }
            primitives[obj][sel].push(args);
        }
    }

    function initCompiler() {
        g = ohm.grammar(shadamaGrammar);
        s = g.createSemantics();
        initPrimitiveTable();
        initSemantics();
    }

    function initSemantics() {
        function addDefaultGlobals(obj) {
            obj["mousedown"] = new Entry("var");
            obj["mousedown"].setInfo(["mousedown", "obj"]);

            obj["mousemove"] = new Entry("var");
            obj["mousemove"].setInfo(["mousemove", "obj"]);
            obj["mouseup"] = new Entry();
            obj["mouseup"].setInfo("var", ["mouseup", "obj"]);
        }

        function processHelper(symDict) {
            var queue;   // = [name]
            var result;  // = {<name>: <name>}
            function traverse() {
                var head = queue.shift();
                if (!result[head]) {
                    result.add(head, head);
                    var d = symDict[head];
                    if (d && d.type == "helper") {
                        d.usedHelpersAndPrimitives.keysAndValuesDo((h, v) => {
                            queue.push(h);
                        });
                    }
                }
            }

            for (var k in symDict) {
                var dict = symDict[k];
                if (dict.type == "method") {
                    queue = [];
                    result = new OrderedPair();
                    dict.usedHelpersAndPrimitives.keysAndValuesDo((i, v) => {
                        queue.push(i);
                    });
                    while (queue.length > 0) {
                        traverse();
                    }
                    dict.allUsedHelpersAndPrimitives = result;
                }
            }
        }

        s.addAttribute(
            "topLevelName",
            {
                ProgramDecl(_p, s) {
                    return "_programName";
                },

                Breed(_b, n, _o, fs, _c) {
                    return n.sourceString;
                },

                Patch(_p, n, _o, fs, _c) {
                    return n.sourceString;
                },

                Event(_e, n) {
                    return n.sourceString;
                },

                On(_o, t, _a, n) {
                    var trigger = t.trigger();
                    return "_trigger" + trigger.toString();
                },

                Data(_d, n, _o, s1, _a, s2, _c) {  // synonym for event?
                    return n.sourceString;
                },                  

                Method(_d, n, _o, ns, _c, b) {
                    return n.sourceString;
                },

                Helper(_d, n, _o, ns, _c, b) {
                    return n.sourceString;
                },

                Static(_s, n, _o, ns, _c, b) {
                    return n.sourceString;
                }
            });

        s.addAttribute(
            "programName",
            {
                ProgramDecl(_p, s) {
                    return s.children[1].sourceString;
                }
            });


        s.addOperation(
            "symbols(entry)",
            {
                TopLevel(p, ds) {
                    var table = {};
                    var entry;
                    addDefaultGlobals(table);
                    if (p.children.length > 0) {
                        // program name
                        entry = new Entry();
                        entry.setGlobal(table);
                        var name = p.children[0].symbols(entry);
                        table[name] = entry;
                    }
                    for (var i = 0; i< ds.children.length; i++) {
                        entry = new Entry();
                        entry.setGlobal(table);
                        var name = ds.children[i].symbols(entry);
                        table[name] = entry;
                    }
                    //processHelper(table);
                    return table;
                },

                ProgramDecl(_p, s) {
                    var entry = this.args.entry;
                    entry.setEntryType("_programName");
                    entry.setInfo(this.programName);
                    return this.topLevelName;
                },

                Breed(_b, n, _o, fs, _c) {
                    var entry = this.args.entry;
                    entry.setEntryType("breed");
                    fs.symbols(entry);
                    return this.topLevelName;
                },

                Patch(_p, n, _o, fs, _c) {
                    var entry = this.args.entry;
                    entry.setEntryType("patch");
                    fs.symbols(entry);
                    return this.topLevelName;
                },

                Event(_e, n) {
                    var entry = this.args.entry;
                    entry.setEntryType("event");
                    return this.topLevelName;
                },

                On(_o, t, _a, n) {
                    var entry = this.args.entry;
                    var trigger = t.trigger();
                    entry.setEntryType("trigger");
                    entry.setInfo(t.symbols(entry));
                    return this.topLevelName;
                },

                Data(_d, n, _o, s1, _a, s2, _c) {  // synonym for event?
                    var entry = this.args.entry;
                    entry.setEntryType("event");
                    var realS1 = s1.children[1].sourceString;
                    var realS2 = s2.children[1].sourceString;
                    entry.setInfo([n, realS1, realS2]);
                    return this.topLevelName;
                },

                Method(_d, n, _o, ns, _c, b) {
                    var entry = this.args.entry;
                    entry.setEntryType("method");
                    ns.symbols(entry);
                    b.symbols(entry);
                    return this.topLevelName;
                },

                Helper(_d, n, _o, ns, _c, b) {
                    var entry = this.args.entry;
                    entry.setEntryType("helper");
                    var type = n.type(entry);
                    ns.symbols(entry);
                    b.symbols(entry);
                    return this.topLevelName;
                },

                Static(_s, n, _o, ns, _c, b) {
                    var entry = this.args.entry;
                    entry.setEntryType("static");
                    ns.symbols(entry);
                    b.symbols(entry);
                    return this.topLevelName;
                },

                Formals_list(h, _c, r) {
                    var entry = this.args.entry;
                    var formals = [];
                    var sym = h.symbols(entry);
                    entry.add("param", null, sym[0], sym[1]);
                    for (var i = 0; i < r.children.length; i++) {
                        var sym = r.children[i].symbols(entry);
                        entry.add("param", null, sym[0], sym[1]);
                    }
                },

                StatementList(ss) { // an iter node
                    var entry = this.args.entry;
                    for (var i = 0; i< ss.children.length; i++) {
                        ss.children[i].symbols(entry);
                    }
                },

                VariableDeclaration(n, optType, optI) {
                    var entry = this.args.entry;
                    var type = null;
                    if (optType.children.length > 0) {
                        type = optType.children[0].symbols(entry);
                    }

                    if (optI.children.length > 0) {
                        optI.children[0].symbols(entry);
                    }

                    entry.add("var", null, n.sourceString, type);
                },

                IfStatement(_if, _o, c, _c, t, _e, optF) {
                    var entry = this.args.entry;
                    c.symbols(entry);
                    t.symbols(entry);
                    if (optF.children.length > 0) {
                        optF.children[0].symbols(entry);
                    }
                },

                LeftHandSideExpression_field(n, _a, f) {
                    var entry = this.args.entry;
                    var name = n.sourceString;

                    check((entry.type == "method" && (name === "this" || entry.hasVariable(name))) ||
                          (entry.type == "helper" && entry.hasVariable(name)),
                          n.source.endIdx,
                          `variable ${name} is not declared`);

                    entry.add("propOut", n.sourceString, f.sourceString, null);;
                },

                PrimExpression_field(n, _p, f, optType) {
                    var entry = this.args.entry;
                    if (entry.type == "method") {
                        if (n.ctorName === "PrimExpression" &&
                            (n.children[0].ctorName === "PrimExpression_variable")) {
                            var name = n.sourceString;
                            // this is the case when it is left most.
                            var isOther = entry.param.has(name) &&
                                entry.getType("param", null, name) == "object";
                            // this is when they are accessed as texture
                            if (name === "this" || isOther) {
                                var type = null;
                                if (optType.children.length > 0) {
                                    type = optType.children[0].symbols(entry);
                                }
                                entry.add("propIn", n.sourceString, f.sourceString, type);
                                return;
                            } else {
                                check(entry.hasVariable(name),
                                      n.source.endIdx,
                                      `unknown variable ${name}`);
                            }
                        }
                    } else if (entry.type == "static") {
                    }
                },
                                
                PrimExpression_variable(n) {
                    var entry = this.args.entry;
                    var name = n.sourceString;
                    if (entry.type == "method" || entry.type == "helper") {
                        check(entry.hasVariable(name),
                              n.source.endIdx,
                              `variable ${name} is not declared`);
                    }

                    //entry.add("ref", null, n.sourceString, null);
                },

                PrimitiveCall(n, _o, as, _c) {
                    var entry = this.args.entry;
                    entry.maybeHelperOrPrimitive(n.sourceString);
                    as.symbols(entry);
                },

                Actuals_list(h, _c, r) {
                    var entry = this.args.entry;
                    h.symbols(entry);
                    for (var i = 0; i < r.children.length; i++) {
                        r.children[i].symbols(entry);
                    }
                },

                TypedVar(i, t) {
                    var entry = this.args.entry;
                    return [i.sourceString, t.symbols(entry)];
                },

                ColonType(_c, t) {
                    return t.sourceString;;
                },

                ident(_h, _r) {},
                number(s) {},
                _terminal() {},
                _nonterminal(children) {
                    var entry = this.args.entry;
                    for (var i = 0; i < children.length; i++) {
                        children[i].symbols(entry);
                    }
                },
            });

        function isSwizzle(str) {
            if (!(1 <= str.length && str.length <= 4)) {
                return false;
            }

            var arrays = [["x", "y", "z", "w"], ["r", "g", "b", "a"]];
            for (var j = 0; j < arrays.length; j++) {
                var ary = arrays[j];
                if (ary.includes(str[0])) {
                    for (var i = 1; i < str.length; i++) {
                        if (!(ary.includes(str[i]))) {
                            return false;
                        }
                    }
                    return true;
                }
            }
            return false;
        }

        function checkBinOp(l, op, r, args) {
            var entry = args.entry;
            check(l.type(entry) == r.type(entry),
                  op.source.endIdx,
                  "operand type mismatch");
            return l.type(entry);
        };

        s.addOperation(
            "type(entry)",
            {
                TopLevel(p, ds) {
                    var table = this.args.entry; // actually the table for toplevel
                    for (var i = 0; i< ds.children.length; i++) {
                        ds.children[i].type(table[ds.children[i].topLevelName]);
                    }
                    return null;
                },


                Method(_d, n, _o, ns, _c, b) {
                    var entry = this.args.entry;
                    entry.setPositionType("vec2");
                    b.type(entry);
                    ns.type(entry);
                    entry.process();
                    return null;
                },

                Helper(_d, n, _o, ns, _c, b) {
                    var entry = this.args.entry;
                    ns.type(entry);
                    b.type(entry);
                    entry.process();
                    return null;
                },

                Static(_s, n, _o, ns, _c, b) {
                    return null;
                },

                Formals_list(h, _c, r) {
                    var entry = this.args.entry;
                    var sym = h.symbols(entry);
                    return null;
                },

                VariableDeclaration(n, optType, optI) {
                    var entry = this.args.entry;
                    var nType = null;
                    if (optType.children.length > 0) {
                        nType = optType.symbols(entry);
                    }
                    if (optI.children.length > 0) {
                        var type = optI.children[0].type(entry);
                        check(type !== null,
                              optI.source.endIdx,
                              "incomplete type");
                        check(!nType || (nType === type),
                              n.source.endIdx,
                              "type mismatch");
                        if (!nType && type) {
                            entry.setType("var", null, n.sourceString, type);
                        }
                    }
                    return nType;
                },

                AssignmentStatement(l, _e, e, _c) {
                    var entry = this.args.entry;
                    var left = l.type(entry);
                    var type = e.type(entry);
                    check (type,
                           e.source.endIdx,
                           "incomplete type");

                    check(!left || left == type,
                          l.source.endIdx,
                          "type mismatch");

                    var isVar = l.children[0].ctorName == "LeftHandSideExpression_ident";
                    if (isVar) {
                        if (!left) {
                            entry.setType("var", left[1], left[2], type);
                        }
                    } else { // field
                        if (!left) {
                            var field = l.children[0];
                            var n = l.children[0].children[0].sourceString;
                            var f = l.children[0].children[2].sourceString;
                            entry.setType("propOut", n, f, type);
                        }
                    }
                },

                LeftHandSideExpression_field(n, _a, f) {
                    var entry = this.args.entry;
                    var name = n.sourceString;
                    var type = entry.add("propOut", name, f.sourceString, null);
                    return null;
                },

                LeftHandSideExpression_ident(n) {
                    var entry = this.args.entry;
                    var type = entry.add("var", null, n.sourceString, null);
                    return null;
                },

                _nonterminal(children) {
                    var entry = this.args.entry;
                    var type = null;
                    for (var i = 0; i < children.length; i++) {
                        var val = children[i].type(entry);
                        if (type === null) {
                            type = val;
                        }
                    }
                    return type;
                },

                LogicalExpression_and(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                LogicalExpression_or(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                RelationalExpression_le(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                RelationalExpression_ge(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                RelationalExpression_lt(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                RelationalExpression_gt(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                RelationalExpression_equal(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                RelationalExpression_notEqual(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                AddExpression_plus(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                AddExpression_minus(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                MulExpression_times(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                MulExpression_divide(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                MulExpression_mod(l, op, r) {
                    return checkBinOp(l, op, r, this.args);
                },

                UnaryExpression_plus(_p, e) {
                    return e.type(this.args.entry);
                },

                UnaryExpression_minus(_p, e) {
                    return e.type(this.args.entry);
                },

                UnaryExpression_not(_p, e) {
                    return e.type(this.args.entry);
                },

                PrimExpression_field(n, _p, f, optType) {
                    var entry = this.args.entry;
                    
                    if (entry.type == "method") {
                        if (n.ctorName === "PrimExpression" &&
                            (n.children[0].ctorName === "PrimExpression_variable")) {
                            var name = n.sourceString;
                            var isOther = entry.param.has(name) &&
                                entry.getType("param", null, name) == "object";
                            // this is when they are accessed as texture
                            if (name === "this" || isOther) {
                                var type = entry.getType("propIn", name, f.sourceString);
                                check(type,
                                      f.source.endIdx,
                                      "type not specified");
                                return type;
                            }
                        }
                        var nType = n.type(entry);
                        check (nType !== "object",
                               n.source.endIdx,
                               "compound field access is only possible for vector types");
                        check(isSwizzle(f.sourceString),
                              f.source.endIdx,
                              "field accessor has to be a swizzle accessor");
                        var type;
                        switch(f.sourceString.length) {
                        case 1:
                            return "float";
                        case 2:
                            return "vec2";
                        case 3:
                            return "vec3";
                        case 4:
                            return "vec4";
                        }
                    }
                },
                                
                PrimExpression_variable(n) {
                    var entry = this.args.entry;
                    var name = n.sourceString;

                    // hmm. prob'ly better to have a single API
                    var type = entry.getType("var", null, name);
                    if (!type) {
                        type = entry.getType("param", null, name);
                    }
                    check(type,
                          n.source.endIdx,
                          "type not specified");
                    return type;
                },

                PrimitiveCall(n, _o, as, _c) {
                    var entry = this.args.entry;
                    var name = n.sourceString;
                    var types = [];

                    if (as.children[0].ctorName === "Actuals_list") {
                        types = as.children[0].type(entry);
                    }
                    if (name == "sqrt") {
                        check(types.length === 1 && types[0] == "float", n.source.endIdx, "type error");
                        return "float";
                    } else if (name == "vec2") {
                        check((types.length === 1 && types[0] == "vec2") ||
                              (types.length === 2 && types[0] == "float" &&  types[1] == "float"),
                              n.source.endIdx,
                              "type error");
                        return "vec2";
                    } else if (name == "vec4") {
                        return "vec4";
                    }
                },

                Actuals_list(h, _c, r) {
                    var entry = this.args.entry;
                    var result = [];
                    result.push(h.type(entry));
                    for (var i = 0; i < r.children.length; i++) {
                        result.push(r.children[i].type(entry));
                    }
                    return result;
                },

                ident(_h, _r) {return null},
                number(s) {return "float"},
                _terminal() {return null},
            });

        s.addOperation(
            "compile(table)",
            {
                TopLevel(p, ds) {
                    var table = this.args.table;
                    var result = {};

                    var child = p;
                    result[p.topLevelName] = p.compile(table)[0];

                    for (var i = 0; i < ds.children.length; i++) {
                        var child = ds.children[i];
                        result[child.topLevelName] = child.compile(table);
                    }
                    return result;
                },

                ProgramDecl(_p, s) {
                    var table = this.args.table;
                    var entry = table[this.topLevelName];
                    return entry.info;
                },

                Breed(_b, n, _o, fs, _c) {
                    var table = this.args.table;
                    var entry = table[this.topLevelName];
                    return [entry, n.sourceString];
                },

                Patch(_p, n, _o, fs, _c) {
                    var table = this.args.table;
                    var entry = table[this.topLevelName];
                    return [entry,n.souceString];
                },

                Event(_e, n) {
                    var table = this.args.table;
                    var entry = table[this.topLevelName];
                    return entry.info;
                },

                On(_o, t, _a, k) {
                    var table = this.args.table;
                    var entry = table[this.topLevelName];
                    return entry.info;
                },

                Data(_d, i, _o, s1, _a, s2, _c) {
                    var table = this.args.table;
                    var entry = table[this.topLevelName];
                    return entry.info;
                },

                Method(_d, n, _o, ns, _c, b) {
                    var table = this.args.table;
                    var entry = table[this.topLevelName];
                    var vert = new CodeStream();
                    var frag = new CodeStream();

                    return this.glsl_method(entry, vert, frag);
                },

                Helper(_d, n, _o, ns, _c, b) {
                    var table = this.args.table;
                    var entry = table[this.topLevelName];
                    var vert = new CodeStream();
                    var frag = new CodeStream();

                    return this.glsl_helper(entry, vert, frag);
                },

                Static(_d, n, _o, ns, _c, b) {
                    var table = this.args.table;
                    var entry = table[this.topLevelName];
                    var js = new CodeStream();
                    return this.static(entry, js);
                }
            });

        s.addOperation(
            "glsl_method(entry, vert, frag)",
            {
                Method(_d, n, _o, ns, _c, b) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;

                    var prologue = fragments.breedPrologue["2"];

                    if (!entry.forBreed || entry.hasPatchInput) {
                        prologue = prologue + fragments.patchPrologue.vec2;
                    }
                    vert.push(prologue);

                    entry.uniforms().forEach(elem => {
                        vert.push(elem);
                        vert.cr();
                    });

                    entry.paramUniforms().forEach(elem => {
                        vert.push(elem);
                        vert.cr();
                    });

                    entry.vertVaryings().forEach(elem => {
                        vert.push(elem);
                        vert.cr();
                    });

                    vert.crIfNeeded();

//                    entry.primitivesAndHelpers().forEach((n) => {
//                        vert.push(n);
//                    });

                    vert.push("void main()");

                    // fragment head

                    frag.push("#version 300 es\n");
                    frag.push("precision highp float;\n");

                    entry.fragVaryings().forEach((elem) =>{
                        frag.push(elem);
                        frag.cr();
                    });

                    entry.outs().forEach((elem) => {
                        frag.push(elem);
                        frag.cr();
                    });

                    frag.crIfNeeded();
                    frag.push("void main()");

                    b.glsl_method(entry, vert, frag);

                    vert.crIfNeeded();

                    frag.pushWithSpace("{");
                    frag.cr();

                    frag.addTab();
                    entry.fragOut().forEach((line) => {
                        frag.tab();
                        frag.push(line);
                        frag.cr();
                    });
                    frag.decTab();
                    frag.crIfNeeded();
                    frag.push("}");
                    frag.cr();

                    return [entry, vert.contents(), frag.contents(), n.sourceString];
                },

                Block(_o, ss, _c) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;

                    vert.pushWithSpace("{\n");
                    vert.addTab();

                    if (entry.hasPatchInput) {
                        vert.push(fragments.patchInput.vec2);
                    } else {
                        vert.push(fragments.noPatchInput);
                    }

                    if (entry.forBreed) {
                        vert.push(fragments.blockBreedPrologue);
                    } else {
                        vert.push(fragments.blockPatchPrologue);
                    }

                    entry.scalarParamTable.keysAndValuesDo((key, value) => {
                        var name = value[2];
                        vert.tab();
                        vert.push(`${value[3]} ${name} = u_scalar_${name};`);
                        vert.cr();
                    });

                    entry.uniformDefaults().forEach(elem => {
                        vert.tab();
                        vert.push(elem);
                        vert.cr();
                    });

                    ss.glsl_inner(entry, vert, frag);
                    vert.push(fragments.blockEpilogue);

                    vert.decTab();
                    vert.tab();
                    vert.push("}");
                },


            });

        function transBinOp(l, r, op, args) {
            var entry = args.entry;
            var vert = args.vert;
            var frag = args.frag;
            vert.push("(");
            l.glsl_inner(entry, vert, frag);
            vert.push(op);
            r.glsl_inner(entry, vert, frag);
            vert.push(")");
        };

        s.addOperation(
            "glsl_inner(entry, vert, frag)",
            {
                Block(_o, ss, _c) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;

                    vert.pushWithSpace("{");
                    vert.cr();
                    vert.addTab();
                    ss.glsl_inner(entry, vert, frag);
                    vert.decTab();
                    vert.tab();
                    vert.push("}");
                },

                StatementList(ss) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    for (var i = 0; i < ss.children.length; i++) {
                        vert.tab();
                        ss.children[i].glsl_inner(entry, vert, frag);
                    }
                },

                Statement(e) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    e.glsl_inner(entry, vert, frag);
                    if (e.ctorName !== "Block" && e.ctorName !== "IfStatement") {
                        vert.push(";");
                        vert.cr();
                    }
                    if (e.ctorName == "IfStatement") {
                        vert.cr();
                    }
                },

                IfStatement(_i, _o, c, _c, t, _e, optF) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    vert.pushWithSpace("if");
                    vert.pushWithSpace("(");
                    c.glsl_inner(entry, vert, frag);
                    vert.push(")");
                    t.glsl_inner(entry, vert, frag);
                    if (optF.children.length === 0) { return;}
                    vert.pushWithSpace("else");
                    optF.glsl_inner(entry, vert, frag);
                },

                AssignmentStatement(l, _a, e, _) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    l.glsl_inner(entry, vert, frag);
                    vert.push(" = ");
                    e.glsl_inner(entry, vert, frag);
                },

                VariableStatement(_v, d, _s) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    d.glsl_inner(entry, vert, frag);
                },

                VariableDeclaration(n, optT, i) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    vert.push(entry.getType("var", null, n.sourceString));
                    vert.pushWithSpace(n.sourceString);
                    if (i.children.length !== 0) {
                        vert.push(" = ");
                        i.glsl_inner(entry, vert, frag);
                    }
                },

                Initialiser(_a, e) {
                    e.glsl_inner(this.args.entry, this.args.vert, this.args.frag);
                },

                LeftHandSideExpression_field(n, _p, f) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    vert.push(entry.varying(n.sourceString, f.sourceString));
                },

                ExpressionStatement(e ,_s) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    e.glsl_inner(entry, vert, frag);
                },

                Expression(e) {
                    e.glsl_inner(this.args.entry, this.args.vert, this.args.frag);
                },

                LogicalExpression(e) {
                    e.glsl_inner(this.args.entry, this.args.vert, this.args.frag);
                },

                LogicalExpression_and(l, _, r) {
                    transBinOp(l, r, " && ", this.args);
                },

                LogicalExpression_or(l, _, r) {
                    transBinOp(l, r, " || ", this.args);
                },

                RelationalExpression(e) {
                    e.glsl_inner(this.args.entry, this.args.vert, this.args.frag);
                },

                RelationalExpression_le(l, _, r) {
                    transBinOp(l, r, " <= ", this.args);
                },

                RelationalExpression_ge(l, _, r) {
                    transBinOp(l, r, " >= ", this.args);
                },

                RelationalExpression_lt(l, _, r) {
                    transBinOp(l, r, " < ", this.args);
                },

                RelationalExpression_gt(l, _, r) {
                    transBinOp(l, r, " > ", this.args);
                },

                RelationalExpression_equal(l, _, r) {
                    transBinOp(l, r, " == ", this.args);
                },

                RelationalExpression_notEqual(l, _, r) {
                    transBinOp(l, r, " != ", this.args);
                },

                AddExpression(e) {
                    e.glsl_inner(this.args.entry, this.args.vert, this.args.frag);
                },

                AddExpression_plus(l, _, r) {
                    transBinOp(l, r, " + ", this.args);
                },

                AddExpression_minus(l, _, r) {
                    transBinOp(l, r, " - ", this.args);
                },

                MulExpression(e) {
                    e.glsl_inner(this.args.entry, this.args.vert, this.args.frag);
                },

                MulExpression_times(l, _, r) {
                    transBinOp(l, r, " * ", this.args);
                },

                MulExpression_divide(l, _, r) {
                    transBinOp(l, r, " / ", this.args);
                },

                MulExpression_mod(l, _, r) {
                    transBinOp(l, r, " % ", this.args);
                },

                UnaryExpression(e) {
                    e.glsl_inner(this.args.entry, this.args.vert, this.args.frag);
                },

                UnaryExpression_plus(_p, e) {
                    e.glsl_inner(this.args.entry, this.args.vert, this.args.frag);
                },

                UnaryExpression_minus(_p, e) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    vert.pushWithSpace("-");
                    e.glsl_inner(entry, vert, frag);
                },

                UnaryExpression_not(_p, e) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    vert.pushWithSpace("!");
                    e.glsl_inner(entry, vert, frag);
                },

                PrimExpression(e) {
                    e.glsl_inner(this.args.entry, this.args.vert, this.args.frag);
                },

                PrimExpression_paren(_o, e, _c) {
                    e.glsl_inner(this.args.entry, this.args.vert, this.args.frag);
                },

                PrimExpression_number(e) {
                    var vert = this.args.vert;
                    var ind = e.sourceString.indexOf(".");
                    if (ind < 0) {
                        vert.push(e.sourceString + ".0");
                    } else {
                        vert.push(e.sourceString);
                    }
                },

                PrimExpression_field(n, _p, f, optType) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;


                    // need to fix
                    if (entry.isBuiltin(n.sourceString)) {
                        vert.push(n.sourceString + "." + f.sourceString);
                        return;
                    }

                    if (n.ctorName === "PrimExpression" &&
                        (n.children[0].ctorName === "PrimExpression_variable")) {
                        var name = n.sourceString;
                        var isOther = entry.param.has(name) &&
                            entry.getType("param", null, name) == "object";
                        // this is when they are accessed as texture
                        if (name === "this" || isOther) {
                            var type = entry.getType("propIn", n.sourceString, f.sourceString);
                            var suffix = entry.swizzle(type);

                            if (n.sourceString === "this") {
                                vert.push("texelFetch(" +
                                          entry.uniform(n.sourceString, f.sourceString) +
                                          ", ivec2(a_index), 0)." + suffix);
                            } else {
                                var v = entry.uniform(n.sourceString, f.sourceString);
                                vert.push("texelFetch(" +
                                          v + ", ivec2(_pos), 0)." + suffix);
                            }
                        } else {
                            n.glsl_inner(entry, vert, frag);
                            vert.push(".");
                            vert.push(f.sourceString);
                        }
                    }
                },

                PrimExpression_variable(n) {
                    this.args.vert.push(n.sourceString);
                },

                PrimitiveCall(n, _o, as, _c) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    vert.push(n.sourceString);
                    vert.push("(");
                    as.glsl_inner(entry, vert, frag);
                    vert.push(")");
                },

                Actuals_list(h, _c, r) {
                    var entry = this.args.entry;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    h.glsl_inner(entry, vert, frag);
                    for (var i = 0; i < r.children.length; i++) {
                        vert.push(", ");
                        r.children[i].glsl_inner(entry, vert, frag);
                    }
                },

                ident(n, rest) {
                    this.args.vert.push(this.sourceString);
                }
            });

        function staticTransBinOp(l, r, op, args) {
            var entry = args.entry;
            var js = args.js;
            
            var ops = {
                "+": "add",
                "-": "sub",
                "*": "mul",
                "/": "div",
                "%": "mod",
                "<": "lt",
                "<=": "le",
                ">": "gt",
                ">=": "ge",
                "==": "equal",
                "!=": "notEqual"
            };
            js.push("vec." + ops[op] + "(");
            l.static(entry, js);
            js.push(", ");
            r.static(entry, js);
            js.push(", ");
            js.push("" + r.source.endIdx);
            js.push(")");
        };

        s.addOperation(
            "static(entry, js)",
            {

                Static(_s, n, _o, fs, _c, b) {
                    var entry = this.args.entry;
                    var js = this.args.js;

                    js.push("(function");
                    js.pushWithSpace(n.sourceString);
                    js.push("(");
                    js.push(""); //fs.static(table, null, null, null));
                    js.push(") ");
                    b.static(entry, js);
                    js.push(")");
                    return [entry, js.contents(), this.sourceString];
                },

                Actuals_list(h, _c, r) {
                    var entry = this.args.entry;
                    var js = new CodeStream();

                    var result = [];
                    h.static(entry, js);
                    result.push(js.contents());
                    for (var i = 0; i < r.children.length; i++) {
                        var c = r.children[i];
                        var js = new CodeStream();
                        c.static(entry, js);
                        result.push(js.contents());
                    }
                    return result;
                },

                Block(_o, ss, _c) {
                    var entry = this.args.entry;
                    var js = this.args.js;
                    js.pushWithSpace("{");
                    js.cr();
                    js.addTab();
                    ss.static(entry, js);
                    js.decTab();
                    js.tab();
                    js.push("}");
                },

                StatementList(ss) {
                    var entry = this.args.entry;
                    var js = this.args.js;
                    for (var i = 0; i < ss.children.length; i++) {
                        js.tab();
                        ss.children[i].static(entry, js);
                    }
                },

                Statement(e) {
                    var entry = this.args.entry;
                    var js = this.args.js;
                    e.static(entry, js);
                    if (e.ctorName !== "Block" && e.ctorName !== "IfStatement") {
                        js.push(";");
                        js.cr();
                    }
                    if (e.ctorName == "IfStatement") {
                        js.cr();
                    }
                },

                IfStatement(_i, _o, c, _c, t, _e, optF) {
                    var entry = this.args.entry;
                    var js = this.args.js;
                    js.push("if");
                    js.pushWithSpace("((");
                    c.static(entry, js);
                    js.push(").x)");
                    t.static(entry, js);
                    if (optF.children.length === 0) {return;}
                    js.pushWithSpace("else");
                    optF.static(entry, js);
                },

                VariableStatement(_v, d, _s) {
                    var entry = this.args.entry;
                    var js = this.args.js;
                    d.static(entry, js);
                },

                VariableDeclaration(n, optT, i) {
                    var entry = this.args.entry;
                    var js = this.args.js;
                    var variable = new Entry("event");
                    var sym = n.symbols(entry);
                    variable.setInfo(sym[0], null, sym[1]);
                    entry.global[sym[0]] = variable;
                    var value;
                    if (i.children.length !== 0) {
                        value = i.static(entry, js);
                    } else {
                        value = 'null';
                    }
                    js.push(`env.atPut(${n.sourceString}, (${value}));`);
                },

                AssignmentStatement(l, _a, e, _) {
                    var entry = this.args.entry;
                    var js = this.args.js;
                    var left = entry.global[l.sourceString];
                    check(left && (left.type == "event"),
                          l.source.endIdx,
                          `assignment into undeclared static variable or event ${l.sourceString}`);
                    var val = e.static(entry, js);
                    js.push(`env.setValue(${l.sourceString}, (${val}));`);
                },

                Initialiser(_a, e) {
                    e.static(this.args.entry, this.args.js);
                },

                ExpressionStatement(e, _s) {
                    e.static(this.args.entry, this.args.js);
                },

                Expression(e) {
                    e.static(this.args.entry, this.args.js);
                },

                LogicalExpression(e) {
                    e.static(this.args.entry, this.args.js);
                },

                LogicalExpression_and(l, _, r) {
                    staticTransBinOp(l, r, "&&", this.args);
                },

                LogicalExpression_or(l, _, r) {
                    staticTransBinOp(l, r, "||", this.args);
                },

                RelationalExpression(e) {
                    e.static(this.args.entry, this.args.js);
                },

                RelationalExpression_le(l, _, r) {
                    staticTransBinOp(l, r, "<=", this.args);
                },

                RelationalExpression_ge(l, _, r) {
                    staticTransBinOp(l, r, ">=", this.args);
                },

                RelationalExpression_lt(l, _, r) {
                    staticTransBinOp(l, r, "<", this.args);
                },

                RelationalExpression_gt(l, _, r) {
                    staticTransBinOp(l, r, ">", this.args);
                },

                RelationalExpression_equal(l, _, r) {
                    staticTransBinOp(l, r, "==", this.args);
                },

                RelationalExpression_notEqual(l, _, r) {
                    staticTransBinOp(l, r, "!=", this.args);
                },

                AddExpression(e) {
                    e.static(this.args.entry, this.args.js);
                },

                AddExpression_plus(l, _, r) {
                    staticTransBinOp(l, r, "+", this.args);
                },

                AddExpression_minus(l, _, r) {
                    staticTransBinOp(l, r, "-", this.args);
                },

                MulExpression(e) {
                    e.static(this.args.entry, this.args.js);
                },

                MulExpression_times(l, _, r) {
                    staticTransBinOp(l, r, "*", this.args);
                },

                MulExpression_divide(l, _, r) {
                    staticTransBinOp(l, r, "/", this.args);
                },

                MulExpression_mod(l, _, r) {
                    staticTransBinOp(l, r, "%", this.args);
                },

                UnaryExpression(e) {
                    e.static(this.args.entry, this.args.js);
                },

                UnaryExpression_plus(_p, e) {
                    e.static(this.args.entry, this.args.js);
                },

                UnaryExpression_minus(_p, e) {
                    var js = this.args.js;
                    js.pushWithSpace("-");
                    e.static(this.args.entry, this.args.js);
                },

                UnaryExpression_not(_p, e) {
                    var js = this.args.js;
                    js.pushWithSpace("!");
                    e.static(this.args.entry, this.args.js);
                },

                PrimExpression(e) {
                    e.static(this.args.entry, this.args.js);
                },

                PrimExpression_paren(_o, e, _c) {
                    e.static(this.args.entry, this.args.js);
                },

                PrimExpression_string(e) {
                    var js = this.args.js;
                    js.push(e.sourceString);
                },

                PrimExpression_number(e) {
                    var js = this.args.js;
                    js.push("new vec(1, " + e.sourceString + ")");
                },

                PrimExpression_field(n, _p, f, optT) {
                    var js = this.args.js;
                    n.static(this.args.entry, js);
                    js.push(".");
                    js.push(f.sourceString);
                },

                PrimExpression_variable(n) {
                    var entry = this.args.entry;
                    var js = this.args.js;
                    js.push("env.at('" + n.sourceString + "')");
                },

                PrimitiveCall(n, _o, as, _c) {
                    var entry = this.args.entry;
                    var js = this.args.js;
                    var prim = n.sourceString;
                    var math = ["random", // 0 arg
                                "abs", "acos", "acosh", "asin", "asinh", "atan", "atanh",
                                "cbrt", "ceil", "cos", "cosh", "exp", "expm1", "floor",
                                "log", "log1p", "log10", "log2", "round", "sign", "sin",
                                "sinh", "sqrt", "tan", "tanh", "trunc", // 1 arg
                                "atan2", "max", "min", "pow" // 2 args
                               ];
                    if (math.indexOf(prim) >= 0) {
                        var actuals = as.static(entry, null);
                        var str = actuals.join(", ");
                        js.push("Math.");
                        js.push(prim);
                        js.push("(");
                        js.push(str);
                        js.push(")");
                        return;
                    }
                    var vec = ["vec2", "vec3", "vec4"];
                    var ind = vec.indexOf(prim);
                    if (ind >= 0) {
                        var actuals = as.static(entry, null);
                        var str = actuals.join(", ");
                        js.push("new vec(");
                        js.push("" + (ind+2));
                        js.push(", ");
                        js.push(str);
                        js.push(")");
                    }
                },

                MethodCall(r, _p, n, _o, as, _c) {
                    var entry = this.args.entry;
                    var js = this.args.js;

                    var global = entry.global;

                    var rcvr = r.sourceString;
                    var obj = global[rcvr];
                    var selector = n.sourceString;

                    check(obj, 
                        r.source.endIdx,
                        `${rcvr} is not known`);

                    var type = obj.type;

                    var actuals = as.static(entry, null);

                    // Now, if the receiver is not a breed, or even if it is,
                    // the selector is not a known method in the compilation environment, 
                    // is compiled to be a primitive.  If the call fails.

                    if (type === "breed") {
                        var method = global[selector];
                        if (method && method.type == "method") {
                            var formals = method.param;

                            check((actuals.length === formals.size()),
                                  as.source.endIdx,
                                  `argument count does not match for method ${selector}`);

                            var params = new CodeStream();
                            var objectsString = new CodeStream();

                            params.addTab();
                            objectsString.addTab();
                            for (var i = 0; i < actuals.length; i++) {
                                var actual = actuals[i];
                                var formal = formals.at(i); // ["param", null, name, type]
                                var shortName = formal[2];
                                if (formal[3] == "object") {
                                    objectsString.tab();
                                    objectsString.push(`objects["${shortName}"] = ${actual};\n`);
                                } else {
                                    params.push(`params["${shortName}"] = ${actual};\n`);
                                }
                            }
                    var callProgram = `
(function() {
    var data = scripts['${selector}'];
    var func = data[0];
    var ins = data[1][0]; // [[name, <fieldName>]]
    var formals = data[1][1];
    var outs = data[1][2]; //[[object, <fieldName>]]
    var objects = {};
    objects.this = env.at('${rcvr}');
    ${objectsString.contents()}
    var params = {};
    ${params.contents()}
    func(objects, outs, ins, params);
})()`;
                            js.push(callProgram);
                            return;
                        }
                    }

                    var primArgsList;
                    if (rcvr === "Display") {
                        primArgsList = primitives["Display"][selector];
                    } else if (type == "breed" || type == "patch" || type == "static") {
                        primArgsList = primitives[type][selector];
                    }


                    check(primArgsList,
                          as.source.endIdx,
                          `primitive ${selector} for ${rcvr} is not known`);

                    var match = false;
                    for (var pi = 0; pi < primArgsList.length; pi++) {
                        var primArgs = primArgsList[pi];
                        match |= actuals.length === primArgs.length
                    }


                    check(match,
                          as.source.endIdx,
                          `the argument count for primitive ${selector}`);

                    var str = actuals.join(", ");
                    js.push(`env.at('${rcvr}').${selector}(${str})`);
                },

                _terminal() {return []},
                empty() {return []}
        });
    }

    function check(aBoolean, pos, message) {
        if (!aBoolean) {
            var error = new Error("syntax error");
            error.reason = message;
            error.expected = message;
            error.pos = pos;
            error.src = null;
            throw error;
        }
    }

    function shouldFire(trigger, env) {
        if (typeof trigger == "string") {
            var evt = env[trigger];
            return evt && evt.ready;
        } else {
            var key = trigger[0];
            if (key == "and") {
                return shouldFire(trigger[1], env) && shouldFire(trigger[2], env);
            } else if (key == "and") {
                return shouldFire(trigger[1], env) || shouldFire(trigger[2], env);
            } else {
                return false;
            }
        }
    }

    function resetTrigger(trigger, env) {
        if (typeof trigger == "string") {
            var evt = env[trigger];
            if (evt) {
                evt.ready = false;
            }
        } else {
            resetTrigger(trigger[1], env);
            resetTrigger(trigger[2], env);
        }
    }

    class vec {
        constructor(arity, x, y, z, w) {
            this.arity = arity; // arity, has to be 1, 2, 3 or 4
            if (typeof x === "object") {
                x = x.x;
            }
            if (typeof y === "object") {
                y = y.x;
            }
            if (typeof z === "object") {
                z = z.x;
            }
            if (typeof w === "object") {
                w = w.x;
            }

            this.x = arity >= 1 ? x | 0 : 0;
            this.y = arity >= 2 ? y | 0 : 0;
            this.z = arity >= 3 ? z | 0 : 0;
            this.w = arity >= 4 ? w | 0 : 0;
        }

        toString() {
            var result = "vec" + this.arity + "(";
            result += this.x;
            if (this.arity == 1) {return result + ")"};
            result += ", " + this.y;
            if (this.arity == 2) {return result + ")"};
            result += ", " + this.z;
            if (this.arity == 3) {return result + ")"};
            result += ", " + this.w;
            if (this.arity == 4) {return result + ")"};
        }
    }

    function arityCheck(a, b, pos) {
        check(a.arity == b.arity,
               pos,
               "arity mismatch");
    }

    vec.add = function(a, b, pos) {
        arityCheck(a, b, pos);
        return new vec(a.arity, a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w);
    }

    vec.sub = function(a, b, pos) {
        arityCheck(a, b, pos);
        return new vec(a.arity, a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w);
    }

    vec.mul = function(a, b, pos) {
        arityCheck(a, b, pos);
        return new vec(a.arity, a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w);
    }

    vec.div = function(a, b, pos) {
        arityCheck(a, b, pos);
        var x = b.x !== 0 ? a.x / b.x : (a.x >= 0 ? Infinity : -Infinity);
        var y = b.y !== 0 ? a.y / b.y : (a.y >= 0 ? Infinity : -Infinity);
        var z = b.z !== 0 ? a.z / b.z : (a.z >= 0 ? Infinity : -Infinity);
        var w = b.w !== 0 ? a.w / b.w : (a.w >= 0 ? Infinity : -Infinity);
        return new vec(a.arity, x, y, z, w);
    }

    vec.lt = function(a, b, pos) {
        arityCheck(a, b, pos);
        return new vec(a.arity, a.x < b.x ? 1 : 0, a.y < b.y ? 1 : 0, a.z < b.z ? 1 : 0, a.w < b.w ? 1 : 0);
    }

    vec.le = function(a, b, pos) {
        arityCheck(a, b, pos);
        return new vec(a.arity, a.x <= b.x ? 1 : 0, a.y <= b.y ? 1 : 0, a.z <= b.z ? 1 : 0, a.w <= b.w ? 1 : 0);
    }

    vec.gt = function(a, b, pos) {
        arityCheck(a, b, pos);
        return new vec(a.arity, a.x > b.x ? 1 : 0, a.y > b.y ? 1 : 0, a.z > b.z ? 1 : 0, a.w > b.w ? 1 : 0);
    }

    vec.ge = function(a, b, pos) {
        arityCheck(a, b, pos);
        return new vec(a.arity, a.x >= b.x ? 1 : 0, a.y >= b.y ? 1 : 0, a.z >= b.z ? 1 : 0, a.w >= b.w ? 1 : 0);
    }

    vec.equal = function(a, b, pos) {
        arityCheck(a, b, pos);
        return new vec(a.arity, a.x == b.x ? 1 : 0, a.y == b.y ? 1 : 0, a.z == b.z ? 1 : 0, a.w == b.w ? 1 : 0);
    }

    vec.notEqual = function(a, b, pos) {
        arityCheck(a, b, pos);
        return new vec(a.arity, a.x != b.x ? 1 : 0, a.y != b.y ? 1 : 0, a.z != b.z ? 1 : 0, a.w != b.w ? 1 : 0);
    }

    function createSwizzlers(vec, str4) {
        function doIt(getter) {
            var result = "";
            for (var i = 0; i < getter.length; i++) {
                result += ", this." + getter[i];
            }
            var str = `(function ${getter}() {return new vec(${getter.length}${result})})`;
            var func = eval(str);
            Object.defineProperty(vec.prototype, getter, {get: func});
        };

        var limit = Math.pow(5, 4);
        var i = 5;
        while (i < limit) {
            var s = i.toString(5).split("");
            if (s.indexOf("0") < 0) {
                s = s.map((c) => str4[parseInt(c, 10)-1]).join("");
                doIt(s);
            }
            i++;
        }
    }

    class ShadamaTexture {
        constructor(texture, format) {
            this.texture = texture;
            this.format = format;
        }
    }

    class ShadamaEnv {
        constructor() {
            this.values = {};
        }

        atPut(key, value) {
            this.values[key] = new ShadamaEvent(value);
            return value;
        }

        at(key) {
            var val = this.values[key];
            if (val !== undefined) {
                return val.value;
            }
            return undefined;
        }

        keys() {
            return Object.keys(this.values);
        }
    }

    class ShadamaFunction {
        constructor(name, shadama) {
            this.name = name;
            this.shadama = shadama;
        }

        start() {
            this.shadama.startScript(this.name);
        }

        stop() {
            this.shadama.stopScript(this.name);
        }

        step() {
            this.shadama.once(this.name);
        }
    }

    class ShadamaEvent {
        constructor(value) {
            if (value !== undefined) {
                this.setValue(value);
                return;
            }
            this.value = undefined;
            this.ready = false;
        }

        setValue(value) {
            this.value = value;
            this.ready = true;
            return this;
        }

        reset() {
            this.ready = false;
        }
    }

    class ShadamaTrigger {
        constructor(trigger, triggerAction) {
            this.trigger = trigger;
            this.triggerAction = triggerAction;
        }

        maybeFire(shadama) {
            var env = shadama.env;
            if (shouldFire(this.trigger, env)) {
                resetTrigger(this.trigger, env);
                var type = this.triggerAction[0];
                var name = this.triggerAction[1];
                if (type == "start") {
                    shadama.startScript(name);
                } else if (type == "stop") {
                    shadama.stopScript(this.triggerAction[1]);
                } else if (type == "step") {
                    shadama.once(name);
                }
            }
        }
    }

    class OrderedPair {
        constructor() {
            this.keys = [];
            this.entries = {};
        }

        add(k, entry) {
            var maybeEntry = this.entries[k];
            if (maybeEntry) {
                if (maybeEntry[0] === entry[0] &&
                    maybeEntry[1] === entry[1] &&
                    maybeEntry[2] === entry[2] &&
                    maybeEntry[3] === entry[3]) {
                    return;
                }
                if (maybeEntry[0] === entry[0] &&
                    maybeEntry[1] === entry[1] &&
                    maybeEntry[2] === entry[2]) {
                    if (maybeEntry[3] === null && entry[3] !== null) {
                        maybeEntry[3] = entry[3];
                        return;
                    }
                    if (maybeEntry[3] !== null && entry[3] === null) {
                        return;
                    }
                    if (maybeEntry[3] !== entry[3]) {
                        throw 'error type mismatch';
                        return;
                    }
                }
                throw "error duplicate variable" + k
                return;
            }
            this.entries[k] = entry;
            this.keys.push(k);
        }

        addAll(other) {
            other.keysAndValuesDo((key, entry) =>
                                  this.add(key, entry));
        }

        at(key) {
            if (typeof key === "number") {
                return this.entries[this.keys[key]];
            } else {
                return this.entries[key];
            }
        }

        atName(name) {
            var found = null;
            this.keysAndValuesDo((key, value) => {
                if (value[2] == name) {
                    found = value;
                }
            });
            return found;
        }

        keysAndValuesDo(func) {
            for (var i = 0; i < this.keys.length; i++) {
                func(this.keys[i], this.entries[this.keys[i]]);
            }
        }

        keysAndValuesCollect(func) {
            var result = [];
            this.keysAndValuesDo((key, value) => {
                var element = func(key, value);
                result.push(element);
            });
            return result;
        }

        has(name) {
            var found = null;
            this.keysAndValuesDo((key, value) => {
                if (value[2] == name) {
                    found = value;
                }
            });
            return found;
        }

        toArray() {
            return this.keys.map((k) => this.entries[k]);
        }

        size() {
            return this.keys.length;
        }
    }

    class Entry {
        constructor(optType) {
            this.forBreed = true;
            this.hasBreedInput = false;
            this.hasPatchInput = false;
            this.defaultUniforms = ["u_resolution", "u_half"];
            this.defaultAttributes = ["a_index", "b_index"];

            this.usedHelpersAndPrimitives = new OrderedPair();   // foo(a) => foo -> foo

            // - from source (extensional)
            // I use this term because I want to remember which is which)

            this.thisIn = new OrderedPair();   // v = this.x    -> ["propIn", "this", "x"]
            this.otherIn = new OrderedPair();  // v = other.x   -> ["propIn", "other", "x"]
            this.thisOut = new OrderedPair();  // this.x = ... -> ["propOut", "this", "x"]
            this.otherOut = new OrderedPair(); // other.x = ... -> ["propOut", "other", "x"]
            this.param = new OrderedPair();   // def foo(a, b, c) -> [["param", null, "a"], ...]
            this.local = new OrderedPair();    // var x = ... -> ["var", null, "x"]

            // - generated (intensional)

            this.varyingTable = new OrderedPair();
            this.uniformTable = new OrderedPair();
            this.scalarParamTable = new OrderedPair();

            this.type = optType;
        }

        setGlobal(table) {
            this.global = table;
        }

        setEntryType(type) {
            this.type = type;
        }

        setInfo(info) {
            this.info = info;
            // case var: [name, type]
            // case _programName: string
            // case trigger: trigger array // ["and", "a", ["or", "b", "c"]]
            // case event: url and datatype

        }

        setPositionType(type) {
            this.positionType = type;
        }

        beTrigger(trigger, action) {
            // trigger: name | ["and", trigger, triger] | [or trigger, trigger]
            // action ["start"|"step"|"stop", static name]
            this.type = "trigger";
            this.trigger = trigger;
            this.triggerAction = action;
        }

        beData(name, s1, s2) {
            this.type = "data";
            this.eventName = name;
            this.eventSource = [s1, s2]; // not really used;
        }

        process() {
            // When a method takes a patch, it'd have to index them with the position of turtles
            // To fill them in, we
            if (this.otherOut.size() > 0 || this.otherIn.size() > 0) {
                var addition;
                if (dimension == 3) {
                    if (this.positionType == "float") {
                        addition = ["u_that_x", "u_that_y", "u_that_z", "v_step", "v_resolution"];
                    } else if (this.positionType == "vec3") {
                        addition = ["u_that_xyz", "v_step", "v_resolution"];
                    }
                } else if (dimension == 2) {
                    if (this.positionType == "float") {
                        addition = ["u_that_x", "u_that_y"];
                    } else if (this.positionType == "vec2") {
                        addition = ["u_that_xy"];
                    }
                }
                if (addition) {
                    this.defaultUniforms = this.defaultUniforms.concat(addition);
                } else {
                    throw "wrong";
                }
            }

            if (this.thisOut.size() > 0 && this.otherOut.size() > 0) {
                var error = new Error("semantic error");
                error.reason = "shadama cannot write into this and others from the same script.";
                error.expected = "Make sure " + this.methodName + " only writes into either properties of 'this', or properties of method arguments";
                error.pos = this.methodPos;
                error.src = null;
                throw error;
            } else {
                this.forBreed = this.thisOut.size() > 0;
            }


            // Maybe a hack: look for outs that are not ins and add them to ins.
            // For cases when a method does not output a value due to an if statement,
            // It'd have to read values from the original.
            this.thisOut.keysAndValuesDo((key, entry) => {
                this.add("propIn", entry[1], entry[2], entry[3]);
            });
            this.otherOut.keysAndValuesDo((key, entry) => {
                this.add("propIn", entry[1], entry[2], entry[3]);
            });

            this.uniformTable.addAll(this.thisIn);
            this.uniformTable.addAll(this.otherIn);

            if (this.thisIn.size() > 0) {
                this.hasBreedInput = true;
            }
            if (this.otherIn.size() > 0) {
                this.hasPatchInput = true;
            }

            if (this.forBreed) {
                this.varyingTable.addAll(this.thisOut);
            } else {
                this.varyingTable.addAll(this.otherOut);
            }
            this.param.keysAndValuesDo((key, entry) => {
                if (!this.usedAsObject(entry[2])) {
                    this.scalarParamTable.add(key, entry);
                }
            });
        };

        add(tag, rcvr, name, type) {
            var entry = [tag, rcvr, name, type];
            var k = [tag, rcvr ? rcvr : "null", name].join(".");

            if (tag === "propOut" && rcvr === "this") {
                this.thisOut.add(k, entry);
            } else if (tag === "propOut" && rcvr !== "this") {
                this.otherOut.add(k, entry);
            } else if (tag === "propIn" && rcvr === "this") {
                this.thisIn.add(k, entry);
            } else if (tag === "propIn" && rcvr !== "this") {
                this.otherIn.add(k, entry);
            } else if (tag === "param") {
                this.param.add(k, entry);
            } else if (tag === "var") {
                this.local.add(k, entry);
            }
        }

        setType(tag, rcvr, name, type) {
            return this.add(tag, rcvr, name, type);
        }

        getType(tag, rcvr, name, type) {
            var entry;
            if (tag === "propOut" && rcvr === "this") {
                entry = this.thisOut.has(name);
            } else if (tag === "propOut" && rcvr !== "this") {
                entry = this.otherOut.has(name);
            } else if (tag === "propIn" && rcvr === "this") {
                entry = this.thisIn.has(name);
            } else if (tag === "propIn" && rcvr !== "this") {
                entry = this.otherIn.has(name);
            } else if (tag === "param") {
                entry = this.param.has(name);
            } else if (tag === "var") {
                entry = this.local.has(name);
            }
            if (entry) {
                return entry[3];
            }
            return null;
        }

        usedAsObject(n) {
            var result = false;
            this.otherIn.keysAndValuesDo((k, entry) => {
                result = result || (entry[1] === n);
            });
            this.otherOut.keysAndValuesDo((k, entry) => {
                result = result || (entry[1] === n);
            });
            return result;
        }

        uniform(name, field) {
            var k = ["propIn", name, field].join(".");
            var entry = this.uniformTable.at(k);
            if (!entry) {
                debugger;
            }
            return ["u", entry[1], entry[2]].join("_");
        }

        varying(name, field) {
            var k = ["propOut", name, field].join(".");
            var entry = this.varyingTable.at(k);
            return ["v", entry[1],  entry[2]].join("_");
        }

        out(entry) {
            var k = ["propOut", entry[1], entry[2]].join(".");
            var entry = this.varyingTable.at(k);
            return ["o", entry[1],  entry[2]].join("_");
        }

        uniforms() {
            return this.uniformTable.keysAndValuesCollect((key, entry) =>
                                                          "uniform sampler2D " + this.uniform(entry[1], entry[2]) + ";");
        }

        paramUniforms() {
            var result = [];
            this.scalarParamTable.keysAndValuesDo((key, entry) => {
                result.push("uniform " + entry[3] + " u_scalar_" + entry[2] + ";");
            });
            return result;
        }

        vertVaryings() {
            return this.varyingTable.keysAndValuesCollect((key, entry) =>
                                                          "out " + entry[3] + " " + this.varying(entry[1], entry[2]) + ";");
        }

        fragVaryings() {
            return this.varyingTable.keysAndValuesCollect((key, entry) =>
                                                          "in " + entry[3] + " " + this.varying(entry[1], entry[2]) + ";");
        }

        uniformDefaults() {
            return this.varyingTable.keysAndValuesCollect((key, entry) => {
                var ind = entry[1] === "this" ? `ivec2(a_index)` : `ivec2(_pos)`;

                var swizzle = this.swizzle(entry[3]);
                return `${this.varying(entry[1], entry[2])} = texelFetch(${this.uniform(entry[1], entry[2])}, ${ind}, 0).${swizzle};`;
            })
        }

        outs() {
            var i = 0;
            var result = [];
            this.varyingTable.keysAndValuesDo((key, entry) => {
                result.push("layout (location = " + i + ") out " + entry[3] + " " + this.out(entry) + ";");
                i++;
            })
            return result;
        }

        fragOut() {
            return this.varyingTable.keysAndValuesCollect((key, entry) =>
                                                          this.out(entry) + " = " + this.varying(entry[1], entry[2]) + ";");
        }

        isBuiltin(n) {
            return this.defaultAttributes.indexOf(n) >= 0 || this.defaultUniforms.indexOf(n) >= 0 ;
        }

        hasVariable(n) {
            if (this.param.has(n) !== null) {return true;}
            if (this.local.has(n) !== null) {return true;}
            if (["this", "u_resolution", "u_half", "a_index", "b_index"].indexOf(n) >= 0) {
                return true;
            }
            return false;
        }

        insAndParamsAndOuts() {
            var ins = this.uniformTable.keysAndValuesCollect((key, entry) => entry.slice(1));
            var shortParams = this.scalarParamTable.keysAndValuesCollect((key, entry) => entry[2]);
            var outs;
            if (this.forBreed) {
                outs = this.thisOut.keysAndValuesCollect((key, entry) => entry.slice(1));
            } else {
                outs = this.otherOut.keysAndValuesCollect((key, entry) => entry.slice(1));
            }
            return [ins, shortParams, outs];
        }

        swizzle(type) {
            switch (type) {
                case "float":
                return "r";
                case "vec2":
                return "rg";
                case "vec3":
                return "rgb";
                case "vec4":
                return "rgba" // ?
            }
        }

        rawTable() {
            var result = {};
            this.thisIn.keysAndValuesDo((key, entry) => result[key] = entry);
            this.thisOut.keysAndValuesDo((key, entry) => result[key] = entry);
            this.otherIn.keysAndValuesDo((key, entry) => result[key] = entry);
            this.otherOut.keysAndValuesDo((key, entry) => result[key] = entry);
            this.param.keysAndValuesDo((key, entry) => result[key] = entry);
            this.local.keysAndValuesDo((key, entry) => result[key] = entry);
            return result;
        }

        maybeHelperOrPrimitive(aString) {
            this.usedHelpersAndPrimitives.add(aString, aString);
        }

        primitivesAndHelpers() {
            return this.allUsedHelpersAndPrimitives.keysAndValuesCollect((n, v) => {
                if (n === "random") {
                    return `
highp float random(float seed) {
   highp float a  = 12.9898;
   highp float b  = 78.233;
   highp float c  = 43758.5453;
   highp float dt = seed * a + b;
   highp float sn = mod(dt, 3.14159);
   return fract(sin(sn) * c);
}
`
                } else if (globalTable[n] && globalTable[n].type == "helper") {
                    return globalTable[n].helperCode;
                } else {
                    return "";
                }
            });
        }
    }

    class CodeStream {
        constructor() {
            this.result = [];
            this.hadCR = true;
            this.hadSpace = true;
            this.tabLevel = 0;
        }

        addTab() {
            this.tabLevel++;
        }

        decTab() {
            this.tabLevel--;
        }

        cr() {
            this.result.push("\n");
            this.hadCR = true;
        }

        tab() {
            for (var i = 0; i < this.tabLevel; i++) {
                this.result.push("  ");
                this.hadSpace = true;
            }
        }

        skipSpace() {
            this.hadSpace = true;
        }

        crIfNeeded() {
            if (!this.hadCR) {
                this.cr();
            }
        }

        push(val) {
            this.result.push(val);
            var last = val[val.length - 1];
            this.hadSpace = (last === " " || last == "\n" || last == "{" || last == "(");
            this.hadCR = last == "\n";
        }

        pushWithSpace(val) {
            if (!this.hadSpace) {
                this.push(" ");
            }
            this.push(val);
        }

        contents() {
            function flatten(ary) {
                return ary.reduce(function (a, b) {
                    return a.concat(Array.isArray(b) ? flatten(b) : b)}, []).join("");
            };
            return flatten(this.result);
        }
    }

    function parse(aString, optRule) {
        var rule = optRule;
        if (!rule) {
            rule = "TopLevel";
        }
        return g.match(aString, rule);
    }

    function addAsSet(to, from) {
        for (var k in from) {
            if (from.hasOwnProperty(k)) {
                to[k] = from[k];
            }
        }
        return to;
    }

    function translate(str, prod, errorCallback) {
        if (!prod) {
            prod = "TopLevel";
        }
        var match = g.match(str, prod);
        if (!match.succeeded()) {
            console.log(str);
            console.log("did not parse: " + str);
            var error = new Error("parse error");
            error.reason = "parse error";
            error.expected = "Expected: " + match.getExpectedText();
            error.pos = match.getRightmostFailurePosition();
            error.src = str;
            throw error;
        }

        var n = s(match);
        var table = n.symbols(null);
        n.type(table);
        var result = n.compile(table);
        return result;
    }

    var shadama;
    var defaultProgName = optDefaultProgName || "5-Bounce.shadama";

    withThreeJS = !!threeRenderer;
    domTools = !!optDOMTools;

    renderer = threeRenderer;

    if (!renderer) {
        renderer = new StandAloneRenderer();

    }

    runTests = /test.?=/.test(window.location.search);
    showAllEnv = !(/allEnv=/.test(window.location.search));
    degaussdemo = /degaussdemo/.test(window.location.search);

    if (domTools) {
        if (degaussdemo) {
            FIELD_WIDTH = 1024;
            FIELD_HEIGHT = 768
            defaultProgName = "14-DeGauss.shadama";
        }
        var match;
        match = /fw=([0-9]+)/.exec(window.location.search);
        FW = (match && match.length == 2) ? parseInt(match[1]) : FIELD_WIDTH;

        match = /fh=([0-9]+)/.exec(window.location.search);
        FH = (match && match.length == 2)  ? parseInt(match[1]) : FIELD_HEIGHT;

        match = /t=([0-9]+)/.exec(window.location.search);
        T = (match && match.length == 2) ? parseInt(match[1]) : TEXTURE_SIZE;

        readout = document.getElementById("readout");
        watcherList = document.getElementById("watcherList");
        envList = document.getElementById("envList");

        if (!withThreeJS) {
            shadamaCanvas = document.getElementById("shadamaCanvas");
            if (!shadamaCanvas) {
                shadamaCanvas = document.createElement("canvas");
            }
            shadamaCanvas.id = "shadamaCanvas";
            shadamaCanvas.width = FW;
            shadamaCanvas.height = FH;
            shadamaCanvas.style.width = FW + "px";
            shadamaCanvas.style.height = FH + "px";
            gl = shadamaCanvas.getContext("webgl2");
            var ext = gl.getExtension("EXT_color_buffer_float");
            state = gl;
        } else {
            gl = renderer.context;
            if (!renderer.state) {
                throw "a WebGLState has to be passed in";
            }
            state = renderer.state;
            var ext = gl.getExtension("EXT_color_buffer_float");
            shadamaCanvas = gl.canvas;
            shadamaCanvas.id = "shadamaCanvas";
            shadamaCanvas.width = FW;
            shadamaCanvas.height = FH;
            shadamaCanvas.style.width = FW + "px";
            shadamaCanvas.style.height = FH + "px";

        }

        shadama = new Shadama();
        shadama.initDisplay();
        if (!withThreeJS) {
            shadama.addListeners(shadamaCanvas);
        }
        shadama.initServerFiles();
        shadama.initFileList();

        initCompiler();

        createSwizzlers(vec, "xyzw");
        createSwizzlers(vec, "rgba");

        if (runTests) {
            document.getElementById("bigTitle").innerHTML = "Shadama Tests";
            setTestParams(shadama.tester());
            grammarUnitTests();
            symbolsUnitTests();
            typeUnitTests();
            translateUnitTests();
            return;
        }

        if (degaussdemo) {
            document.getElementById("bigTitle").innerHTML = "<button>Full Screen</button>";
            document.getElementById("bigTitle").firstChild.onclick = shadama.goFullScreen;
        }

        if (!editor) {
            function words(str) { let o = {}; str.split(" ").forEach((s) => o[s] = true); return o; }
            CodeMirror.defineMIME("text/shadama", {
                name: "clike",
                keywords: words("program breed patch def static var if else"),
                atoms: words("true false this self width height image mousedown mousemove mouseup time"),
            });

            var cm = CodeMirror.fromTextArea(document.getElementById("code"), {
                mode: "text/shadama",
                matchBrackets: true,
                "extraKeys": {
                    "Cmd-S": function(cm) {shadama.updateCode()},
                },
            });
            shadama.setEditor(cm, "CodeMirror");
        }

        shadama.initEnv(function() {
            var func = function (source) {
                shadama.loadShadama(source);
                if (editor) {
                    editor.doc.setValue(source);
                }
                if (withThreeJS) {
                    if (parent) {
                        parent.onAfterRender = shadama.makeOnAfterRender();
                    }
                }
                if (!withThreeJS) {
                    shadama.maybeRunner();
                }
            };
            shadama.env.at("Display").loadProgram(defaultProgName, func);
        });
    } else {
        if (!renderer.context ||
            renderer.context.constructor != WebGL2RenderingContext) {
            throw "needs a WebGL2 context";
            return;
        }
        gl = renderer.context;
        if (!renderer.state) {
            throw "a WebGLState has to be passed in";
        }
        state = renderer.state;
        var ext = gl.getExtension("EXT_color_buffer_float");
        shadama = new Shadama();
        shadama.initDisplay();
        shadama.initEnv(function() {
            if (parent) {
                shadama.env("Display").loadProgram(defaultProgName);
                parent.onAfterRender = shadama.makeOnAfterRender();
            }
        });
    }

    initBreedVAO();
    initPatchVAO();
    initFramebuffers();

    programs["drawBreed"] = drawBreedProgram();
    programs["drawBreedVec"] = drawBreedVecProgram();
    programs["drawPatch"] = drawPatchProgram();
    programs["debugPatch"] = debugPatchProgram();
    programs["debugBreed"] = debugBreedProgram();
    programs["renderBreed"] = renderBreedProgram();
    programs["renderPatch"] = renderPatchProgram();
    programs["diffusePatch"] = diffusePatchProgram();
    programs["increasePatch"] = increasePatchProgram();
    programs["increaseVoxel"] = increaseVoxelProgram();

//    window.shadama = shadama;
    return shadama;
}

//export {
//   ShadamaFactory
//}
