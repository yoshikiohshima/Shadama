function ShadamaFactory(frame, optDimension, parent, optDefaultProgName) {
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

    var readout;
    var watcherList;  // DOM
    var watcherElements = []; // [DOM]
    var envList; // DOM

    var shadamaCanvas;
    var fullScreenScale = 1;

    var keepGoing = true;
    var animationRequested = false;

    var times = [];

    var standalone;
    var runTests;
    var showAllEnv;
    var degaussdemo;

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

    function createTexture(data, type, width, height) {
        if (!type) {
            type = gl.UNSIGNED_BYTE;
        }
        if (!width) {
            width = T;
        }
        if (!height) {
            height = T;
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
        } else if (type == gl.R32F) {
            gl.texImage2D(gl.TEXTURE_2D, 0, type, width, height, 0, gl.RED, gl.FLOAT, data, 0);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, type, data, 0);
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        state.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    function makeFramebuffer(format, width, height) {
        if (!format) {
            format = gl.UNSIGNED_BYTE;
        }
        if (!width) {
            width = T;
        }
        if (!height) {
            height = T;
        }

        var tex;
        if (format == gl.FLOAT) {
            tex = createTexture(new Float32Array(width * height * 4), format, width, height);
        }
        if (format == gl.R32F) {
            tex = createTexture(new Float32Array(width * height), format, width, height);
        }
        if (format == gl.UNSIGNED_BYTE) {
            tex = createTexture(new Uint8Array(width * height * 4), format, width, height);
        }

        var buffer = gl.createFramebuffer();

        gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
        state.bindTexture(gl.TEXTURE_2D, tex);

        if (format == gl.R32F) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, null);
        } else if (format == gl.UNSIGNED_BYTE) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, format, null);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, format, null);
        }
        state.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        if (!standalone) {
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
        if (standalone) {
            gl.disable(gl.BLEND);
        } else {
            state.setCullFace(THREE.CullFaceNone);
            state.setBlending(THREE.NoBlending);
        }
    }

    function normalBlend() {
        if (standalone) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else {
            state.setBlending(THREE.NormalBlending);
        }
    }

    function oneBlend() {
        if (standalone) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
        } else {
            state.setBlending(THREE.CustomBlending, THREE.AddEquation, THREE.OneFactor, THREE.OneFactor);
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

    function updateOwnVariable(obj, name, optData) {
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

        var ary = optData || new Float32Array(width * height);

        if (obj[name]) {
            gl.deleteTexture(obj[name]);
        }
        if (obj[N + name]) {
            gl.deleteTexture(obj[N + name]);
        }

        obj.own[name] = name;
        obj[name] = createTexture(ary, gl.R32F, width, height);
        obj[N + name] = createTexture(ary, gl.R32F, width, height);
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

        var obj = env[name];
        if (!obj) {
            obj = new cls();
            for (var i = 0; i < fields.length; i++) {
                updateOwnVariable(obj, fields[i]);
            }
            env[name] = obj;
            return true;
        }

        var oldOwn = obj.own;
        var toBeDeleted = [];  // [<str>]
        var toBeCreated = [];  // [<str>]
        var newOwn = {};

        // common case: when the existing own and fields are the same
        for (var i = 0; i < fields.length; i++) {
            var k = fields[i];
            newOwn[k] = k;
        }
        if (stringify(newOwn) === stringify(oldOwn)) {
            return false;
        }

        // other case: get things into toBeDeleted and toBeCreated, and toBeMoved
        for (var k in oldOwn) {
            if (fields.indexOf(k) < 0) {
                toBeDeleted.push(k)
            }
        }
        for (var i = 0; i < fields.length; i++) {
            var k = fields[i];
            if (!oldOwn[k]) {
                toBeCreated.push(k);
            }
        }

        toBeCreated.forEach((k) => updateOwnVariable(obj, k));
        toBeDeleted.forEach((k) => removeOwnVariable(obj, k));
        return true;
    }

    function programFromTable(table, vert, frag, name) {
        return (function () {
            var debugName = name;
            if (debugName === "set") {
            }
            var prog = createProgram(createShader(name + ".vert", vert),
                                     createShader(name + ".frag", frag));
            var vao = breedVAO;
            var uniLocations = {};


            var forBreed = table.forBreed;
            var viewportW = forBreed ? T : FW;
            var viewportH = forBreed ? T : FH;
            var hasPatchInput = table.hasPatchInput;

            table.defaultUniforms.forEach(function(n) {
                uniLocations[n] = gl.getUniformLocation(prog, n);
            });

            table.uniformTable.keysAndValuesDo((key, entry) => {
                var uni = table.uniform(entry);
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
            if (debugName === "set") {
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

                if (standalone) {
                    gl.viewport(0, 0, viewportW, viewportH);
                }

                gl.uniform2f(uniLocations["u_resolution"], FW, FH);
                gl.uniform2f(uniLocations["u_half"], 0.5/viewportW, 0.5/viewportH);

                var offset = 0;
                if (!forBreed || hasPatchInput) {
                    state.activeTexture(gl.TEXTURE0);
                    state.bindTexture(gl.TEXTURE_2D, object.x);
                    gl.uniform1i(uniLocations["u_that_x"], 0);

                    state.activeTexture(gl.TEXTURE1);
                    state.bindTexture(gl.TEXTURE_2D, object.y);
                    gl.uniform1i(uniLocations["u_that_y"], 1);
                    offset = 2;
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
                var uni = table.uniform(entry);
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
        debugTextureBreed = createTexture(new Float32Array(T*T*4), gl.FLOAT, T, T);
        debugTexturePatch = createTexture(new Float32Array(FW*FH*4), gl.FLOAT, FW, FH);

        framebufferBreed = makeFramebuffer(gl.R32F, T, T);
        framebufferPatch = makeFramebuffer(gl.R32F, FW, FH);

        framebufferU8RGBA = makeFramebuffer(gl.UNSIGNED_BYTE, FW, FH);

        framebufferDiffuse = makeFramebuffer(gl.R32F, FW, FH);

        readFramebufferBreed = makeFramebuffer(gl.R32F, T, T);
        readFramebufferPatch = makeFramebuffer(gl.R32F, FW, FH);

        writeFramebufferBreed = makeFramebuffer(gl.R32F, T, T);
        writeFramebufferPatch = makeFramebuffer(gl.R32F, FW, FH);

        framebufferDBreed = makeFramebuffer(gl.FLOAT, T, T);
        framebufferDPatch = makeFramebuffer(gl.FLOAT, FW, FH);
    }

    function Shadama() {
        this.env = {};  // {name: value}
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
        this.readPixelCallback = null;
    }

    Shadama.prototype.evalShadama = function(source) {
        // evaluates ohm compiled shadama code (js code) so that variables are
        // accessible inside the eval
        var env = this.env;
        var scripts = this.scripts;
        return eval(source);
    }

    Shadama.prototype.loadShadama = function(id, source) {
        var newSetupCode;
        var oldProgramName = this.programName;
        var schemaChange = false;
        this.statics = {};
        this.staticsList = [];
        this.scripts = {};
        this.triggers = {};
        var newData = [];
        if (!source) {
            var scriptElement = document.getElementById(id);
            if(!scriptElement){return "";}
            source = scriptElement.text;
        }
        this.cleanUpEditorState();
        try {
            var result = translate(source, "TopLevel", this.reportError.bind(this));
        } catch (e) {
            this.reportError(e);
            return;
        }
        this.compilation = result;

        if (!result) {return "";}
        if (oldProgramName != result["_programName"]) {
            this.resetSystem();
        }
        this.programName = result["_programName"];
        delete result["_programName"];

        for (var k in result) {
            var entry = result[k];
            if (entry[0] == "static") { // static function case
                var src = entry[2];
                var js = entry[1];
                this.statics[k] = this.evalShadama(js);
                this.staticsList.push(k);
                this.env[k] = new ShadamaFunction(k, this);
                if (k === "setup") {
                    newSetupCode = src;
                }
            } else {
                var js = entry[3];
                if (js[0] === "updateBreed") {
                    schemaChange = update(Breed, js[1], js[2], this.env) || schemaChange;
                } else if (js[0] === "updatePatch") {
                    schemaChange = update(Patch, js[1], js[2], this.env) || schemaChange;
                } else if (js[0] === "updateScript") {
                    var table = entry[0];
                    var func = dimension == 2 ? programFromTable : programFromTable3;
                    this.scripts[js[1]] = [ func(table, entry[1], entry[2], js[1]),
                                      table.insAndParamsAndOuts()];
                } else if (js[0] === "event") {
                    this.env[js[1]] = new ShadamaEvent();
                } else if (js[0] === "trigger") {
                    this.triggers[k] = new ShadamaTrigger(js[1], js[2]);
                } else if (js[0] === "data") {
                    this.env[js[1]] = new ShadamaEvent();
                    if (js[3] == "image") {
                        this.env[js[1]] = this.loadImage(js[2]);
                    } else if (js[3] == "audio") {
                        this.env[js[1]] = this.loadAudio(js[2]);
                    }

                    if (newData.length == 0) {
                        newData = js[1];
                    } else {
                        newData = ["and", js[1], newData];
                    }
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
        return standalone ? null
            : targetTexture && renderer.properties.get(targetTexture).__webglTexture || null;
    }

    Shadama.prototype.setReadPixelCallback = function(func) {
        this.readPixelCallback = func;
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
        var object = this.env[objName];
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
            if (standalone) {
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

        state.activeTexture(gl.TEXTURE0);
        state.bindTexture(gl.TEXTURE_2D, tex);

        if (standalone) {
            gl.viewport(0, 0, width, height);
        }
        gl.uniform1i(prog.uniLocations["u_value"], 0);
        gl.uniform2f(prog.uniLocations["u_half"], 0.5/width, 0.5/height);

        if (!standalone) {
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
        debugArray1 = new Float32Array(width * height);
        debugArray2 = new Uint8ClampedArray(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, debugArray, 0);

        for (var i = 0; i < width * height; i++) {
            debugArray1[i] = debugArray[i * 4 + 0];
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

        for (var o in this.env) {
            var obj = this.env[o];
            if (typeof obj == "object" && (obj.constructor == Breed || obj.constructor == Patch)) {
                for (var k in obj.own) {
                    var tex = obj[k];
                    if (tex.constructor === WebGLTexture) {
                        gl.deleteTexture(obj[k]);
                    }
                }
                delete this.env[o];
            }
        }
    }

    Shadama.prototype.updateCode = function() {
        if (!editor) {return;}
        var code = editor.getValue();
        this.loadShadama(null, code);
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
        this.env["time"] = 0.0;
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
        if (!standalone) {return;}
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
            that.env[symbol] = {x: x,  y: y, time: that.env["time"]};
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
        if (!standalone) {return;}
        var examples = [
            "1-Fill.shadama", "2-Disperse.shadama", "3-Gravity.shadama", "4-Two Circles.shadama", "5-Bounce.shadama", "6-Picture.shadama", "7-Duck Bounce.shadama", "8-Back and Forth.shadama", "9-Mandelbrot.shadama", "10-Life Game.shadama", "11-Ball Gravity.shadama", "12-Duck Gravity.shadama", "13-Ribbons.shadama", "16-Diffuse.shadama", "19-Bump.shadama"
        ];
        examples.forEach((n) => {
            this.env["Display"].loadProgram(n, (serverCode) => {
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
            var slash = location.lastIndexOf("/");
            var dir = location.slice(0, slash) + "/" + name;
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

            // three ways to specify name:
            // 1. fully qualified path, starting with "http"
            // 2. [if window.location starts with "http"] path fragment appended to working directory
            // 3. [otherwise - assuming standalone] path fragment appended to shadama2 directory on tinlizzie
            var dir;
            if (name.startsWith("http")) {  // fully qualified
                dir = name;
            } else {
                var location = window.location.toString();
                if (location.startsWith("http")) {
                    var slash = location.lastIndexOf("/");
                    dir = location.slice(0, slash) + "/" + name;
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
        this.env["Display"] = new Display(this);
    }

    Shadama.prototype.initEnv = function(callback) {
        this.env.mousedown = {x: 0, y: 0};
        this.env.mousemove = {x: 0, y: 0};
        this.env.width = FW;
        this.env.height = FH;

//            this.initImage("blur-blue.png", "blurBlue");
//            this.initImage("presentation.png", "presentation");
//            this.initImage("button.png", "button");
//            this.initImage("ahiru.png", "image");
//            this.initImage("rightbutton.png", "right");
//            this.initImage("goals.png", "goals");
//            this.initImage("futurework.png", "futurework");
//            this.initImage("maccready.png", "maccready");
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
        this.stopClock(this.detectEntry(name).clock);
    }

    Shadama.prototype.startScript = function(name) {
        this.steppers[name] = name;
        this.startClock(this.detectEntry(name).clock);
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
        if (!standalone) {return;}
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
            that.env["time"] = (window.performance.now() / 1000) - that.loadTime;
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
        if (!standalone) {return;}
        for (var j = 0; j < watcherList.children.length; j++) {
            var oldEntry = watcherList.children[j];
            if (oldEntry.scriptName === name) {return oldEntry;}
        }
        return null;
    }

    Shadama.prototype.removeAll = function() {
        if (!standalone) {return;}
        while (watcherList.firstChild) {
            watcherList.removeChild(watcherList.firstChild);
        }
    }

    Shadama.prototype.addAll = function(elems) {
        if (!standalone) {return;}
        for (var j = 0; j < elems.length; j++) {
            watcherList.appendChild(elems[j]);
        }
    }

    Shadama.prototype.updateClocks = function() {
        if (!standalone) {return;}
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
                this.env["Display"].clear();
                console.log("loading: " + name);
                this.resetSystem();
                this.loadShadama(null, source);
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
            let props = Object.getOwnPropertyNames(obj)
                .filter((k)=>typeof obj[k] !== "object")
                .map((k)=>`${k}:${printNum(obj[k])}`);
            return `{${props.join(' ')}}`;
        }
        function filter(k) {
            if (showAllEnv) {
                return true;
            } else {
                return(that.env[k] && that.env[k].constructor != ImageData);
            }
        }
        let list = Object.getOwnPropertyNames(that.env)
            .sort()
            .filter(filter)
            .map((k)=>`${k}: ${print(that.env[k])}`);
        if (envList) {
            envList.innerHTML = `<pre>${list.join('\n')}</pre>`;
        }
    }

    Shadama.prototype.populateList = function(newList) {
        if (!standalone) {return;}
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
        this.env[key] = asset;
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
        if (standalone) {
            this.clearColor = 'white';
        } else {
            this.clearColor = new THREE.Color(0xFFFFFFFF);
            this.otherColor = new THREE.Color(0x00000000);
        }
    }

    Display.prototype.clear = function() {
        var t = webglTexture();
        if (t) {
            setTargetBuffer(framebufferU8RGBA, t);
        } else {
            setTargetBuffer(null, null);
        }

        if (standalone) {
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            gl.clearColor(1.0, 1.0, 1.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        } else {
            this.otherColor.copy(renderer.getClearColor());
            renderer.setClearColor(this.clearColor);
            renderer.clearColor();
            renderer.setClearColor(this.otherColor);
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
                    that.shadama.loadShadama(null, serverCode);
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
            this.count = count;
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

        fillSpace(xName, yName, xDim, yDim) {
            this.setCount(xDim * yDim);
            var x = new Float32Array(T * T);
            var y = new Float32Array(T * T);

            for (var j = 0; j < yDim; j++) {
                for (var i = 0; i < xDim; i++) {
                    var ind = xDim * j + i;
                    x[ind] = i;
                    y[ind] = j;
                }
            }
            updateOwnVariable(this, xName, x);
            updateOwnVariable(this, yName, y);
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
            var prog = programs["drawBreed"];
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
            state.bindTexture(gl.TEXTURE_2D, this.x);
            gl.uniform1i(prog.uniLocations["u_x"], 0);

            state.activeTexture(gl.TEXTURE1);
            state.bindTexture(gl.TEXTURE_2D, this.y);
            gl.uniform1i(prog.uniLocations["u_y"], 1);

            state.activeTexture(gl.TEXTURE2);
            state.bindTexture(gl.TEXTURE_2D, this.r);
            gl.uniform1i(prog.uniLocations["u_r"], 2);

            state.activeTexture(gl.TEXTURE3);
            state.bindTexture(gl.TEXTURE_2D, this.g);
            gl.uniform1i(prog.uniLocations["u_g"], 3);

            state.activeTexture(gl.TEXTURE4);
            state.bindTexture(gl.TEXTURE_2D, this.b);
            gl.uniform1i(prog.uniLocations["u_b"], 4);

            state.activeTexture(gl.TEXTURE5);
            state.bindTexture(gl.TEXTURE_2D, this.a);
            gl.uniform1i(prog.uniLocations["u_a"], 5);

            if (standalone) {
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
                if (typeof maybeD == "number") {
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

            if (standalone) {
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

            if (standalone) {
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

        setCount(n) {
            var oldCount = this.count;
            if (n < 0 || !n) {
                n = 0;
            }
            this.count = n;
            //
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

            if (standalone) {
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

            if (standalone) {
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
        this.env["time"] = (window.performance.now() / 1000) - this.loadTime;
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

    Shadama.prototype.maybeRunner = function() {
        if (!animationRequested) {
            this.runner();
        }
    }

    Shadama.prototype.runner = function() {
        if (standalone) {
            animationRequested = false;
            var start = performance.now();
            this.step();
            var now = performance.now();
            times.push({start: start, step: now - start});

            if ((times.length > 0 && now - times[0].start > 1000) || times.length === 2) {
                while (times.length > 1 && now - times[0].start > 500) { times.shift() };
                var frameTime = (times[times.length-1].start - times[0].start) / (times.length - 1);
                var stepTime = times.reduce((a, b) => ({step: a.step + b.step})).step / times.length;
                readout.innerHTML = "" + frameTime.toFixed(1) + " msecs/frame (" + (1000 / frameTime).toFixed(1) + " fps)";
                this.updateEnv();
            }

            this.updateClocks();

            if (keepGoing) {
                window.requestAnimationFrame(this.runner.bind(this));
                animationRequested = true;
            } else {
                keepGoing = true;
            }
        }
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
        this.env.mousemove = {x: x, y: y};
    }

    Shadama.prototype.pointerup = function(x, y) {
        this.env.mouseup = {x: x, y: y};
    }

    Shadama.prototype.pointerdown = function(x, y) {
        this.env.mousedown = {x: x, y: y}
    }

    Shadama.prototype.tester = function() {
        return {
            parse: parse,
            update: update,
            translate: translate,
            s: s,
            Breed: Breed,
            Patch: Patch,
            SymTable: SymTable,
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
    = ProgramDecl? (Breed | Patch | Event | On | Data | Script | Helper | Static)*

  ProgramDecl = program string
  Breed = breed ident "(" Formals ")"
  Patch = patch ident "(" Formals ")"
  Event = event ident
  On = on TriggerExpression arrow (start|stop)? ident
  Data = data ident "(" string "," string ")"
  Script = def ident "(" Formals ")" Block
  Helper = helper ident "(" Formals ")" Block
  Static = static ident "(" Formals ")" Block

  Formals
    = ident ("," ident)* -- list
    | empty

  Block = "{" StatementList "}"

  StatementList = Statement*

  Statement
    = Block
    | VariableStatement
    | AssignmentStatement
    | ExpressionStatement
    | IfStatement
    | ExpressionStatement
    | ReturnStatement

  VariableStatement = var VariableDeclaration ";"
  VariableDeclaration = ident Initialiser?
  Initialiser = "=" Expression

  ReturnStatement = return Expression ";"

  ExpressionStatement = Expression ";"
  IfStatement = if "(" Expression ")" Statement (else Statement)?

  AssignmentStatement
    = LeftHandSideExpression "=" Expression ";"

  LeftHandSideExpression
    = ident "." ident -- field
    | ident

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
    | PrimExpression "." ident     -- field
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
  self = "self" ~identifierPart
  static = "static" ~identifierPart
  program = "program" ~identifierPart
  return = "return" ~identifierPart
  event = "event" ~identifierPart
  on = "on" ~identifierPart
  arrow = "=>" ~identifierPart
  start = "start" ~identifierPart
  stop = "stop" ~identifierPart
  data = "data" ~identifierPart

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

    var primitives;

    function initPrimitiveTable() {
        var data = {
            "clear": new SymTable([], true),
            "setCount": new SymTable([
                ["param", null, "num"]], true),
            "draw": new SymTable([], true),
            "render": new SymTable([], true),
            "fillRandom": new SymTable([
                ["param", null, "name"],
                ["param", null, "min"],
                ["param", null, "max"]], true),
            "fillRandomDir": new SymTable([
                ["param", null, "xDir"],
                ["param", null, "yDir"]] ,true),
            "fillRandomDir3":  new SymTable([
                ["param", null, "xDir"],
                ["param", null, "yDir"],
                ["param", null, "zDir"]], true),
            "fillSpace": new SymTable([
                ["param", null, "xName"],
                ["param", null, "yName"],
                ["param", null, "x"],
                ["param", null, "y"]], true),
            "fillCuboid": new SymTable([
                ["param", null, "xName"],
                ["param", null, "yName"],
                ["param", null, "zName"],
                ["param", null, "x"],
                ["param", null, "y"],
                ["param", null, "z"],
                ["param", null, "step"]], true),
            "fillImage": new SymTable([
                ["param", null, "xName"],
                ["param", null, "yName"],
                ["param", null, "rName"],
                ["param", null, "gName"],
                ["param", null, "bName"],
                ["param", null, "aName"],
                ["param", null, "imageData"]], true),
            "diffuse": new SymTable([
                ["param", null, "name"]], true),
            "increasePatch": new SymTable([
                ["param", null, "name"],
                ["param", null, "patch"],
                ["param", null, "valueOrSrcName"]], true),
            "increaseVoxel": new SymTable([
                ["param", null, "name"],
                ["param", null, "patch"],
                ["param", null, "valueOrSrcName"]], true),
            "random": new SymTable([
                ["param", null, "seed"]], true),
            "playSound": new SymTable([
                ["param", null, "name"]], true),
            "loadProgram": new SymTable([
                ["param", null, "name"]], true),
            "loadData": new SymTable([
                ["param", null, "data"]], true),
            "start": new SymTable([], true),
            "step": new SymTable([], true),
            "stop": new SymTable([], true),
        };

        primitives = {};
        for (var k in data) {
            primitives[k] = data[k];
        }
    }

    function initCompiler() {
        g = ohm.grammar(shadamaGrammar);
        s = g.createSemantics();
        initPrimitiveTable();
        initSemantics();
    }

    function initSemantics() {
        function addDefaults(obj) {
            for (var k in primitives) {
                obj[k] = primitives[k];
            }

            obj["mousedown"] = {x:0, y:0};
            obj["mousemove"] = {x:0, y:0};
            obj["mouseup"] = {x:0, y:0};

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

        s.addOperation(
            "symTable(table)",
            {
                TopLevel(p, ds) {
                    var result = {};
                    addDefaults(result);
                    if (p.children.length > 0) {
                        result = addAsSet(result, p.children[0].symTable(null));
                    }
                    for (var i = 0; i< ds.children.length; i++) {
                        var d = ds.children[i].symTable(null);
                        var ctor = ds.children[i].ctorName;
                        if (ctor == "Script" || ctor == "Static" || ctor == "Helper") {
                            addAsSet(result, d);
                        }
                        if (ctor == "On" || ctor == "Event" || ctor == "Data") {
                            addAsSet(result, d);
                        }
                    }
                    processHelper(result);
                    globalTable = result;
                    return result;
                },

                ProgramDecl(_p, s) {
                    return {_programName: s.sourceString.slice(1, s.sourceString.length - 1)}
                },

                Breed(_b, n, _o, fs, _c) {
                    var table = new SymTable();
                    fs.symTable(table);
                    table.process();
                    return {[n.sourceString]: table};
                },

                Patch(_p, n, _o, fs, _c) {
                    var table = new SymTable();
                    fs.symTable(table);
                    table.process();
                    return {[n.sourceString]: table};
                },

                Event(_e, n) {
                    var table = new SymTable();
                    table.beEvent(n.sourceString);
                    return {[n.sourceString]: table};
                },

                On(_o, t, _a, optK, n) {
                    var table = new SymTable();
                    var trigger = t.trigger();
                    if (optK.children.length > 0) {
                        var k = optK.children[0].sourceString;
                    } else {
                        k = "step";
                    }
                    table.beTrigger(trigger, [k, n.sourceString]);
                    return {["_trigger" + trigger.toString()]: table};
                },

                Data(_d, n, _o, s1, _a, s2, _c) {
                    var table = new SymTable();
                    var realS1 = s1.children[1].sourceString;
                    var realS2 = s2.children[1].sourceString;
                    table.beData(n.sourceString, realS1, realS2);
                    return {[n.sourceString]: table};
                },

                Script(_d, n, _o, ns, _c, b) {
                    var table = new SymTable();
                    ns.symTable(table);
                    b.symTable(table);
                    table.process();
                    return {[n.sourceString]: table};
                },

                Helper(_d, n, _o, ns, _c, b) {
                    var table = new SymTable();
                    ns.symTable(table);
                    b.symTable(table);
                    table.beHelper();
                    return {[n.sourceString]: table};
                },

                Static(_s, n, _o, ns, _c, b) {
                    var table = new SymTable();
                    ns.symTable(table);
                    table.process();
                    table.beStatic();
                    return {[n.sourceString]: table};
                },

                Formals_list(h, _c, r) {
                    var table = this.args.table;
                    table.add("param", null, h.sourceString);
                    for (var i = 0; i < r.children.length; i++) {
                        var n = r.children[i].sourceString;
                        table.add("param", null, n);
                    }
                    return table;
                },

                StatementList(ss) { // an iter node
                    var table = this.args.table;
                    for (var i = 0; i< ss.children.length; i++) {
                        ss.children[i].symTable(table);
                    }
                    return table;
                },

                VariableDeclaration(n, optI) {
                    var table = this.args.table;
                    table.add("var", null, n.sourceString);
                    if (optI.children.length > 0) {
                        optI.children[0].symTable(table);
                    }
                    return table;
                },

                IfStatement(_if, _o, c, _c, t, _e, optF) {
                    var table = this.args.table;
                    c.symTable(table);
                    t.symTable(table);
                    if (optF.children.length > 0) {
                        optF.children[0].symTable(table);
                    }
                    return table;
                },

                LeftHandSideExpression_field(n, _a, f) {
                    var name = n.sourceString;
                    var table = this.args.table;
                    if (!table.hasVariable(name)) {
                        var error = new Error("syntax error");
                        error.reason = `variable ${name} is not declared`;
                        error.expected = `variable ${name} is not declared`;
                        error.pos = n.source.endIdx;
                        error.src = null;
                        throw error;
                    }

                    this.args.table.add("propOut", n.sourceString, f.sourceString);
                    return this.args.table;
                },

                PrimExpression_field(n, _p, f) {
                    var table = this.args.table;
                    if (!(n.ctorName === "PrimExpression" && (n.children[0].ctorName === "PrimExpression_variable"))) {
                        console.log("you can only use 'this' or incoming patch name");
                    }
                    var name = n.sourceString;
                    if (!table.isBuiltin(name)) {
                        table.add("propIn", n.sourceString, f.sourceString);
                    }
                    if (!table.hasVariable(name)) {
                        var error = new Error("syntax error");
                        error.reason = `variable ${name} is not declared`;
                        error.expected = `variable ${name} is not declared`;
                        error.pos = n.source.endIdx;
                        error.src = null;
                        throw error;
                    }
                    return table;
                },

                PrimExpression_variable(n) {
                    return {};//["var." + n.sourceString]: ["var", null, n.sourceString]};
                },

                PrimitiveCall(n, _o, as, _c) {
                    this.args.table.maybeHelperOrPrimitive(n.sourceString);
                    return as.symTable(this.args.table);
                },

                Actuals_list(h, _c, r) {
                    var table = this.args.table;
                    h.symTable(table);
                    for (var i = 0; i < r.children.length; i++) {
                        r.children[i].symTable(table);
                    }
                    return table;
                },

                ident(_h, _r) {return this.args.table;},
                number(s) {return this.args.table;},
                _terminal() {return this.args.table;},
                _nonterminal(children) {
                    var table = this.args.table;
                    for (var i = 0; i < children.length; i++) {
                        children[i].symTable(table);
                    }
                    return table;
                },
            });

        function transBinOp(l, r, op, args) {
            var table = args.table;
            var vert = args.vert;
            var frag = args.frag;
            vert.push("(");
            l.glsl(table, vert, frag);
            vert.push(op);
            r.glsl(table, vert, frag);
            vert.push(")");
        };

        s.addOperation(
            "trigger",
            {
                TriggerExpression_and(t, _op, i) {
                    return ["and", t, i.sourceString];
                },
                TriggerExpression_or(t, _op, i) {
                    return ["or", t, i.sourceString];
                },
                TriggerExpression(i) {
                    return i.sourceString;
                }
            }
        );
        
        s.addOperation(
            "glsl_script_formals",
            {
                Formals_list(h, _c, r) {
                    return [h.sourceString].concat(r.children.map((c) => c.sourceString));
                },
                empty() {
                    return [];
                }
            });

        s.addOperation(
            "glsl_helper(table, vert)",
            {
                Helper(_d, n, _o, ns, _c, b) {
                    var table = this.args.table;
                    var vert = this.args.vert;

                    vert.push("float " + n.sourceString);
                    vert.push("(");
                    ns.glsl_helper(table, vert);
                    vert.push(")");
                    b.glsl_helper(table, vert);

                    vert.crIfNeeded();
                    var code = vert.contents();
                    table.helperCode = code;

                    return {[n.sourceString]: [table, code, "", ["updateHelper", n.sourceString]]};
                },

                Formals_list(h, _c, r) {
                    var table = this.args.table;
                    var vert = this.args.vert;

                    vert.push("float " + h.sourceString);
                    for (var i = 0; i < r.children.length; i++) {
                        var c = r.children[i];
                        vert.push(", float ");
                        vert.push(c.sourceString);
                    }
                },

                Block(_o, ss, _c) {
                    var table = this.args.table;
                    var vert = this.args.vert;

                    vert.pushWithSpace("{\n");
                    vert.addTab();

                    ss.glsl_helper(table, vert);

                    vert.decTab();
                    vert.tab();
                    vert.push("}");
                },

                StatementList(ss) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    for (var i = 0; i < ss.children.length; i++) {
                        vert.tab();
                        ss.children[i].glsl_helper(table, vert);
                    }
                },

                Statement(e) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    e.glsl_helper(table, vert);
                    if (e.ctorName !== "Block" && e.ctorName !== "IfStatement") {
                        vert.push(";");
                        vert.cr();
                    }
                    if (e.ctorName == "IfStatement") {
                        vert.cr();
                    }
                },

                IfStatement(_i, _o, c, _c, t, _e, optF) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    vert.pushWithSpace("if");
                    vert.pushWithSpace("(");
                    c.glsl_helper(table, vert);
                    vert.push(")");
                    t.glsl_helper(table, vert);
                    if (optF.children.length === 0) { return;}
                    vert.pushWithSpace("else");
                    optF.glsl_helper(table, vert);
                },


                ReturnStatement(_r, e, _s) {
                    var table = this.args.table;
                    var vert = this.args.vert;

                    vert.pushWithSpace("return");
                    vert.push(" ");
                    e.glsl_helper(table, vert);
                },

                AssignmentStatement(l, _a, e, _) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    l.glsl_helper(table, vert);
                    vert.push(" = ");
                    e.glsl_helper(table, vert);
                },

                VariableStatement(_v, d, _s) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    d.glsl_helper(table, vert);
                },

                VariableDeclaration(n, i) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    vert.push("float");
                    vert.pushWithSpace(n.sourceString);
                    if (i.children.length !== 0) {
                        vert.push(" = ");
                        i.glsl_helper(table, vert);
                    }
                },

                Initialiser(_a, e) {
                    e.glsl_helper(this.args.table, this.args.vert);
                },

                LeftHandSideExpression_field(n, _p, f) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    vert.push(n.sourceString);
                },

                ExpressionStatement(e ,_s) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    e.glsl_helper(table, vert);
                },

                Expression(e) {
                    e.glsl_helper(this.args.table, this.args.vert);
                },

                LogicalExpression(e) {
                    e.glsl_helper(this.args.table, this.args.vert);
                },

                LogicalExpression_and(l, _, r) {
                    transBinOp(l, r, " && ", this.args);
                },

                LogicalExpression_or(l, _, r) {
                    transBinOp(l, r, " || ", this.args);
                },

                RelationalExpression(e) {
                    e.glsl_helper(this.args.table, this.args.vert);
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
                    e.glsl_helper(this.args.table, this.args.vert);
                },

                AddExpression_plus(l, _, r) {
                    transBinOp(l, r, " + ", this.args);
                },

                AddExpression_minus(l, _, r) {
                    transBinOp(l, r, " - ", this.args);
                },

                MulExpression(e) {
                    e.glsl_helper(this.args.table, this.args.vert);
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
                    e.glsl_helper(this.args.table, this.args.vert);
                },

                UnaryExpression_plus(_p, e) {
                    e.glsl_helper(this.args.table, this.args.vert);
                },

                UnaryExpression_minus(_p, e) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    vert.pushWithSpace("-");
                    e.glsl_helper(table, vert);
                },

                UnaryExpression_not(_p, e) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    vert.pushWithSpace("!");
                    e.glsl_helper(table, vert);
                },

                PrimExpression(e) {
                    e.glsl_helper(this.args.table, this.args.vert);
                },

                PrimExpression_paren(_o, e, _c) {
                    e.glsl_helper(this.args.table, this.args.vert);
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

                PrimExpression_field(n, _p, f) {
                    var table = this.args.table;
                    var vert = this.args.vert;

                    if (table.isObject(n.sourceString)) {
                        vert.push(n.sourceString + "." + f.sourceString);
                    } else {
                        throw "error";
                    }
                },

                PrimExpression_variable(n) {
                    this.args.vert.push(n.sourceString);
                },

                PrimitiveCall(n, _o, as, _c) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    vert.push(n.sourceString);
                    vert.push("(");
                    as.glsl_helper(table, vert);
                    vert.push(")");
                },

                Actuals_list(h, _c, r) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    h.glsl_helper(table, vert);
                    for (var i = 0; i < r.children.length; i++) {
                        vert.push(", ");
                        r.children[i].glsl_helper(table, vert);
                    }
                },

                ident(n, rest) {
                    // ??
                    this.args.vert.push(this.sourceString);
                },
            });

        s.addOperation(
            "glsl_inner(table, vert, frag)",
            {
                Block(_o, ss, _c) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;

                    var patchInput = `
  float _x = texelFetch(u_that_x, ivec2(a_index), 0).r;
  float _y = texelFetch(u_that_y, ivec2(a_index), 0).r;
  vec2 _pos = vec2(_x, _y);
`;

                    var voxelInput = `
  float _x = texelFetch(u_that_x, ivec2(a_index), 0).r;
  float _y = texelFetch(u_that_y, ivec2(a_index), 0).r;
  float _z = texelFetch(u_that_z, ivec2(a_index), 0).r;
  _x = floor(_x / v_step); // 8   //  [0..64), if originally within [0..512)
  _y = floor(_y / v_step); // 8
  _z = floor(_z / v_step); // 8

  int index = int(_z * v_resolution.x * v_resolution.y + _y * v_resolution.x + _x);
  vec2 _pos = vec2(index % int(u_resolution.x), index / int(u_resolution.x));
`;

                    var patchPrologue = `
  vec2 oneToOne = ((_pos / u_resolution) + u_half) * 2.0 - 1.0;
`;

                    var breedPrologue = `
  vec2 oneToOne = (b_index + u_half) * 2.0 - 1.0;
`;

                    var voxelPrologue = `
  vec2 oneToOne = ((_pos / u_resolution.xy) + u_half) * 2.0 - 1.0;
`;

                    var epilogue = `
  gl_Position = vec4(oneToOne, 0.0, 1.0);
  gl_PointSize = 1.0;
`;

                    vert.pushWithSpace("{\n");
                    vert.addTab();

                    if ((table.hasPatchInput || !table.forBreed)) {
                        if (dimension == 2) {
                            vert.push(patchInput);
                        } else {
                            vert.push(voxelInput);
                        }
                    }

                    if (table.forBreed) {
                        vert.push(breedPrologue);
                    } else {
                        if (dimension == 2) {
                            vert.push(patchPrologue);
                        } else {
                            vert.push(voxelPrologue);
                        }
                    }

                    table.scalarParamTable.keysAndValuesDo((key, entry) => {
                        var e = entry[2];
                        var template1 = `float ${e} = u_scalar_${e};`;
                        vert.tab();
                        vert.push(template1);
                        vert.cr();
                    });

                    table.uniformDefaults().forEach(elem => {
                        vert.tab();
                        vert.push(elem);
                        vert.cr();
                    });

                    ss.glsl(table, vert, frag);
                    vert.push(epilogue);

                    vert.decTab();
                    vert.tab();
                    vert.push("}");
                },

                Script(_d, n, _o, ns, _c, b) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;

                    var breedPrologue =
`#version 300 es
precision highp float;
layout (location = 0) in vec2 a_index;
layout (location = 1) in vec2 b_index;
uniform vec${dimension} u_resolution;
uniform vec2 u_half;
`;

                    if (dimension == 3) {
                        breedPrologue = breedPrologue + `uniform float v_step;
uniform vec3 v_resolution;
`;
                    }

                    var patchPrologue = breedPrologue + `
uniform sampler2D u_that_x;
uniform sampler2D u_that_y;
`;

                    if (dimension == 3) {
                        patchPrologue = patchPrologue + `uniform sampler2D u_that_z;
`;
                    }

                    vert.push(table.forBreed && !table.hasPatchInput ? breedPrologue : patchPrologue);

                    table.uniforms().forEach(elem => {
                        vert.push(elem);
                        vert.cr();
                    });

                    table.paramUniforms().forEach(elem => {
                        vert.push(elem);
                        vert.cr();
                    });

                    table.vertVaryings().forEach(elem => {
                        vert.push(elem);
                        vert.cr();
                    });

                    vert.crIfNeeded();

                    table.primitivesAndHelpers().forEach((n) => {
                        vert.push(n);
                    });

                    vert.push("void main()");

                    // fragment head

                    frag.push("#version 300 es\n");
                    frag.push("precision highp float;\n");

                    table.fragVaryings().forEach((elem) =>{
                        frag.push(elem);
                        frag.cr();
                    });

                    table.outs().forEach((elem) => {
                        frag.push(elem);
                        frag.cr();
                    });

                    frag.crIfNeeded();
                    frag.push("void main()");

                    b.glsl_inner(table, vert, frag);

                    vert.crIfNeeded();

                    frag.pushWithSpace("{");
                    frag.cr();

                    frag.addTab();
                    table.fragColors().forEach((line) => {
                        frag.tab();
                        frag.push(line);
                        frag.cr();
                    });
                    frag.decTab();
                    frag.crIfNeeded();
                    frag.push("}");
                    frag.cr();

                    return {[n.sourceString]: [table, vert.contents(), frag.contents(), ["updateScript", n.sourceString]]};
                }
            });

        s.addOperation(
            "glsl(table, vert, frag)",
            {
                TopLevel(p, ds) {
                    var table = this.args.table;
                    var result = {};
                    for (var i = 0; i < ds.children.length; i++) {
                        var child = ds.children[i];
                        if (child.ctorName == "Static") {
                            var js = new CodeStream();
                            var val = child.static(table, js, null, false);
                            addAsSet(result, val);
                        } else {
                            var val = child.glsl(table, null, null);
                            addAsSet(result, val);
                        }
                    }
                    result["_programName"] = table["_programName"];
                    return result;
                },

                Breed(_b, n, _o, fs, _c) {
                    var table = this.args.table;
                    var js = ["updateBreed", n.sourceString, fs.glsl_script_formals()];
                    return {[n.sourceString]: [table[n.sourceString], "", "", js]};
                },

                Patch(_p, n, _o, fs, _c) {
                    var table = this.args.table;
                    var js = ["updatePatch", n.sourceString, fs.glsl_script_formals()];
                    return {[n.sourceString]: [table[n.sourceString], "", "" ,js]};
                },

                Event(_e, n) {
                    var table = this.args.table;
                    var js = ["event", n.sourceString];
                    return {[n.sourceString]: [table[n.sourceString], "", "", js]};
                },

                On(_o, t, _a, optK, k) {
                    var table = this.args.table;
                    var trigger = t.trigger();
                    var key = "_trigger" + trigger.toString();
                    var entry = table[key];
                    var js = ["trigger", entry.trigger, entry.triggerAction];
                    return {[key]: [table[key], "", "", js]};
                },

                Data(_d, i, _o, s1, _a, s2, _c) {
                    var table = this.args.table;
                    var key = i.sourceString;
                    var entry = table[key];
                    var realS1 = s1.children[1].sourceString;
                    var realS2 = s2.children[1].sourceString;
                    var js = ["data", i.sourceString, realS1, realS2];
                    return {[key]: [entry, "", "", js]};
                },

                Script(_d, n, _o, ns, _c, b) {
                    var inTable = this.args.table;
                    var table = inTable[n.sourceString];
                    var vert = new CodeStream();
                    var frag = new CodeStream();

                    return this.glsl_inner(table, vert, frag);
                },

                Helper(_d, n, _o, ns, _c, b) {
                    var inTable = this.args.table;
                    var table = inTable[n.sourceString];
                    var vert = new CodeStream();

                    return this.glsl_helper(table, vert);
                },

                Block(_o, ss, _c) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;

                    vert.pushWithSpace("{");
                    vert.cr();
                    vert.addTab();
                    ss.glsl(table, vert, frag);
                    vert.decTab();
                    vert.tab();
                    vert.push("}");
                },

                StatementList(ss) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    for (var i = 0; i < ss.children.length; i++) {
                        vert.tab();
                        ss.children[i].glsl(table, vert, frag);
                    }
                },

                Statement(e) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    e.glsl(table, vert, frag);
                    if (e.ctorName !== "Block" && e.ctorName !== "IfStatement") {
                        vert.push(";");
                        vert.cr();
                    }
                    if (e.ctorName == "IfStatement") {
                        vert.cr();
                    }
                },

                IfStatement(_i, _o, c, _c, t, _e, optF) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    vert.pushWithSpace("if");
                    vert.pushWithSpace("(");
                    c.glsl(table, vert, frag);
                    vert.push(")");
                    t.glsl(table, vert, frag);
                    if (optF.children.length === 0) { return;}
                    vert.pushWithSpace("else");
                    optF.glsl(table, vert, frag);
                },

                AssignmentStatement(l, _a, e, _) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    l.glsl(table, vert, frag);
                    vert.push(" = ");
                    e.glsl(table, vert, frag);
                },

                VariableStatement(_v, d, _s) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    d.glsl(table, vert, frag);
                },

                VariableDeclaration(n, i) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    vert.push("float");
                    vert.pushWithSpace(n.sourceString);
                    if (i.children.length !== 0) {
                        vert.push(" = ");
                        i.glsl(table, vert, frag);
                    }
                },

                Initialiser(_a, e) {
                    e.glsl(this.args.table, this.args.vert, this.args.frag);
                },

                LeftHandSideExpression_field(n, _p, f) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    vert.push(table.varying(["propOut", n.sourceString, f.sourceString]));
                },

                ExpressionStatement(e ,_s) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    e.glsl(table, vert, frag);
                },

                Expression(e) {
                    e.glsl(this.args.table, this.args.vert, this.args.frag);
                },

                LogicalExpression(e) {
                    e.glsl(this.args.table, this.args.vert, this.args.frag);
                },

                LogicalExpression_and(l, _, r) {
                    transBinOp(l, r, " && ", this.args);
                },

                LogicalExpression_or(l, _, r) {
                    transBinOp(l, r, " || ", this.args);
                },

                RelationalExpression(e) {
                    e.glsl(this.args.table, this.args.vert, this.args.frag);
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
                    e.glsl(this.args.table, this.args.vert, this.args.frag);
                },

                AddExpression_plus(l, _, r) {
                    transBinOp(l, r, " + ", this.args);
                },

                AddExpression_minus(l, _, r) {
                    transBinOp(l, r, " - ", this.args);
                },

                MulExpression(e) {
                    e.glsl(this.args.table, this.args.vert, this.args.frag);
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
                    e.glsl(this.args.table, this.args.vert, this.args.frag);
                },

                UnaryExpression_plus(_p, e) {
                    e.glsl(this.args.table, this.args.vert, this.args.frag);
                },

                UnaryExpression_minus(_p, e) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    vert.pushWithSpace("-");
                    e.glsl(table, vert, frag);
                },

                UnaryExpression_not(_p, e) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    vert.pushWithSpace("!");
                    e.glsl(table, vert, frag);
                },

                PrimExpression(e) {
                    e.glsl(this.args.table, this.args.vert, this.args.frag);
                },

                PrimExpression_paren(_o, e, _c) {
                    e.glsl(this.args.table, this.args.vert, this.args.frag);
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

                PrimExpression_field(n, _p, f) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;

                    if (table.isBuiltin(n.sourceString)) {
                        vert.push(n.sourceString + "." + f.sourceString);
                    } else {
                        if (n.sourceString === "this") {
                            vert.push("texelFetch(" +
                                      table.uniform(["propIn", n.sourceString, f.sourceString]) +
                                      `, ivec2(a_index), 0).r`);
                        } else {
                            vert.push("texelFetch(" +
                                      table.uniform(["propIn", n.sourceString, f.sourceString]) +
                                      `, ivec2(_pos), 0).r`);
                        }
                    }
                },

                PrimExpression_variable(n) {
                    this.args.vert.push(n.sourceString);
                },

                PrimitiveCall(n, _o, as, _c) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    vert.push(n.sourceString);
                    vert.push("(");
                    as.glsl(table, vert, frag);
                    vert.push(")");
                },

                Actuals_list(h, _c, r) {
                    var table = this.args.table;
                    var vert = this.args.vert;
                    var frag = this.args.frag;
                    h.glsl(table, vert, frag);
                    for (var i = 0; i < r.children.length; i++) {
                        vert.push(", ");
                        r.children[i].glsl(table, vert, frag);
                    }
                },

                ident(n, rest) {
                    this.args.vert.push(this.sourceString);
                }
            });

        function staticTransBinOp(l, r, op, args) {
            var table = args.table;
            var js = args.js;
            var method = args.method;
            var isOther = args.isOther;
            js.push("(");
            l.static(table, js, method, isOther);
            js.push(op);
            r.static(table, js, method, isOther);
            js.push(")");
        };

        s.addOperation(
            "static_method_inner(table, js, method, isOther)",
            {
                Actuals_list(h, _c, r) {
                    var table = this.args.table;
                    var result = [];
                    var js = new CodeStream();
                    var method = this.args.method;

                    function isOther(i) {
                        var realTable = table[method];
                        if (!realTable) {return false}
                        var p = realTable.param.at(i);
                        if (!p) {
                            var error = new Error("semantic error");
                            error.reason = `argument count does not match for method ${method}`;
                            error.expected = `argument count does not match for method ${method}`;
                            error.pos = h.source.endIdx;
                            error.src = null;
                            throw error;
                        }
                        var r = realTable.usedAsOther(p[2]);
                        return r;
                    };
                    h.static(table, js, method, isOther(0));
                    result.push(js.contents());
                    for (var i = 0; i < r.children.length; i++) {
                        var c = r.children[i];
                        var js = new CodeStream();
                        c.static(table, js, method, isOther(i+1));
                        result.push(js.contents());
                    }
                    return result;
                },

                Formals_list(h, _c, r) {
                    var table = this.args.table;
                    var result = [];
                    var js = new CodeStream();

                    result.push(h.sourceString);
                    for (var i = 0; i < r.children.length; i++) {
                        var c = r.children[i];
                        result.push(", ");
                        result.push(c.sourceString);
                    }
                    return result;
                },

                empty() {
                    return [];
                }
            });

        s.addOperation(
            "static(table, js, method, isOther)",
            {

                Static(_s, n, _o, fs, _c, b) {
                    var table = this.args.table;
                    var js = this.args.js;
                    var method = this.args.method;

                    js.push("(function");
                    js.pushWithSpace(n.sourceString);
                    js.push("(");
                    js.push(fs.static_method_inner(table, null, null, null));
                    js.push(") ");
                    b.static(table, js, method, false);
                    js.push(")");
                    return {[n.sourceString]: ["static", js.contents(), this.sourceString]};
                },

                Block(_o, ss, _c) {
                    var table = this.args.table;
                    var js = this.args.js;
                    var method = this.args.method;
                    js.pushWithSpace("{");
                    js.cr();
                    js.addTab();
                    ss.static(table, js, method, false);
                    js.decTab();
                    js.tab();
                    js.push("}");
                },

                StatementList(ss) {
                    var table = this.args.table;
                    var js = this.args.js;
                    var method = this.args.method;
                    var isOther = this.args.isOther;
                    for (var i = 0; i < ss.children.length; i++) {
                        js.tab();
                        ss.children[i].static(table, js, method, isOther);
                    }
                },

                Statement(e) {
                    var table = this.args.table;
                    var js = this.args.js;
                    var method = this.args.method;
                    var isOther = this.args.isOther;
                    e.static(table, js, method, isOther);
                    if (e.ctorName !== "Block" && e.ctorName !== "IfStatement") {
                        js.push(";");
                        js.cr();
                    }
                    if (e.ctorName == "IfStatement") {
                        js.cr();
                    }
                },

                IfStatement(_i, _o, c, _c, t, _e, optF) {
                    var table = this.args.table;
                    var js = this.args.js;
                    var method = this.args.method;
                    var isOther = this.args.isOther;
                    js.push("if");
                    js.pushWithSpace("(");
                    c.static(table, js, method, isOther);
                    js.push(")");
                    t.static(table, js, method, isOther);
                    if (optF.children.length === 0) {return;}
                    js.pushWithSpace("else");
                    optF.static(table, js, method, isOther);
                },

                VariableStatement(_v, d, _s) {
                    var table = this.args.table;
                    var js = this.args.js;
                    var method = this.args.method;
                    var isOther = this.args.isOther;
                    d.static(table, js, method, isOther);
                },

                VariableDeclaration(n, i) {
                    var table = this.args.table;
                    var js = this.args.js;
                    var method = this.args.method;
                    var isOther = this.args.isOther;
                    var symTable = new SymTable();
                    symTable.beStaticVariable(i.sourceString);
                    table[n.sourceString] = symTable;
                    js.push("env.");
                    js.push(n.sourceString);
                    js.pushWithSpace("= ");
                    if (i.children.length !== 0) {
                        i.static(table, js, method, isOther);
                    } else {
                        js.pushWithSpace("null;");
                    }
                },

                AssignmentStatement(l, _a, e, _) {
                    var table = this.args.table;
                    var js = this.args.js;
                    var method = this.args.method;
                    var isOther = this.args.isOther;
                    var left = table[l.sourceString];
                    if (!left || (!left.isEvent() && !left.isStaticVariable())) {
//                            var error = new Error("semantic error");
//                            error.reason = `assignment into undeclared static variable or event ${l.sourceString}`;
//                            error.expected = `assignment into undeclared static variable or event ${l.sourceString}`;
//                            error.pos = l.source.endIdx;
//                            error.src = null;
//                            throw error;
                    }
                    js.push("env.");
                    js.push(l.sourceString);
                    js.pushWithSpace("= ");
                    e.static(table, js, method, isOther);
                },

                Initialiser(_a, e) {
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                ExpressionStatement(e, _s) {
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                Expression(e) {
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                LogicalExpression(e) {
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                LogicalExpression_and(l, _, r) {
                    staticTransBinOp(l, r, " && ", this.args);
                },

                LogicalExpression_or(l, _, r) {
                    staticTransBinOp(l, r, " || ", this.args);
                },

                RelationalExpression(e) {
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                RelationalExpression_le(l, _, r) {
                    staticTransBinOp(l, r, " <= ", this.args);
                },

                RelationalExpression_ge(l, _, r) {
                    staticTransBinOp(l, r, " >= ", this.args);
                },

                RelationalExpression_lt(l, _, r) {
                    staticTransBinOp(l, r, " < ", this.args);
                },

                RelationalExpression_gt(l, _, r) {
                    staticTransBinOp(l, r, " > ", this.args);
                },

                RelationalExpression_equal(l, _, r) {
                    staticTransBinOp(l, r, " == ", this.args);
                },

                RelationalExpression_notEqual(l, _, r) {
                    staticTransBinOp(l, r, " != ", this.args);
                },

                AddExpression(e) {
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                AddExpression_plus(l, _, r) {
                    staticTransBinOp(l, r, " + ", this.args);
                },

                AddExpression_minus(l, _, r) {
                    staticTransBinOp(l, r, " - ", this.args);
                },

                MulExpression(e) {
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                MulExpression_times(l, _, r) {
                    staticTransBinOp(l, r, " * ", this.args);
                },

                MulExpression_divide(l, _, r) {
                    staticTransBinOp(l, r, " / ", this.args);
                },

                MulExpression_mod(l, _, r) {
                    staticTransBinOp(l, r, " % ", this.args);
                },

                UnaryExpression(e) {
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                UnaryExpression_plus(_p, e) {
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                UnaryExpression_minus(_p, e) {
                    var js = this.args.js;
                    js.pushWithSpace("-");
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                UnaryExpression_not(_p, e) {
                    var js = this.args.js;
                    js.pushWithSpace("!");
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                PrimExpression(e) {
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                PrimExpression_paren(_o, e, _c) {
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                PrimExpression_string(e) {
                    var js = this.args.js;
                    js.push(e.sourceString);
                },

                PrimExpression_number(e) {
                    var js = this.args.js;
                    js.push(e.sourceString);
                },

                PrimExpression_field(n, _p, f) {
                    var js = this.args.js;
                    n.static(this.args.table, js, this.args.method, this.args.isOther);
                    js.push(".");
                    js.push(f.sourceString);
                },

                PrimExpression_variable(n) {
                    var table = this.args.table;
                    var js = this.args.js;
                    var method = this.args.method;
                    var isOther = this.args.isOther;
                    js.push('env["' + n.sourceString + '"]');
                },

                PrimitiveCall(n, _o, as, _c) {
                    var table = this.args.table;
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
                        var actuals = as.static_method_inner(table, null, null, false);
                        var str = actuals.join(", ");
                        js.push("Math.");
                        js.push(prim);
                        js.push("(");
                        js.push(str);
                        js.push(")");
                    }
                },

                MethodCall(r, _p, n, _o, as, _c) {
                    var table = this.args.table;
                    var js = this.args.js;
                    var method = n.sourceString;

                    var displayBuiltIns = ["clear", "playSound", "loadProgram"];

                    var builtIns = ["draw", "render", "setCount", "fillRandom", "fillSpace", "fillCuboid", "fillRandomDir", "fillRandomDir3", "fillImage", "loadData", "start", "stop", "step", "diffuse", "increasePatch", "increaseVoxel"];
                    var myTable = table[n.sourceString];

                    var actuals = as.static_method_inner(table, null, method, false);
                    if ((r.sourceString === "Display" && displayBuiltIns.indexOf(method) >= 0) || builtIns.indexOf(method) >= 0) {
                        if (actuals.length !== primitives[method].param.size()) {
                            var error = new Error("semantic error");
                            error.reason = `argument count does not match for primitive ${method}`;
                            error.expected = `argument count does not match for primitive ${method}`;
                            error.pos = as.source.endIdx;
                            error.src = null;
                            throw error;
                        }
                        var str = actuals.join(", ");
                        js.push(`env["${r.sourceString}"].${method}(${str})`);
                        return;
                    }

                    var formals;
                    if (myTable) {
                        formals = myTable.param;
                    }

                    if (formals && (actuals.length !== formals.size())) {
                        var error = new Error("semantic error");
                        error.reason = `argument count does not match for method ${n.sourceString}`;
                        error.expected = `argument count does not match for method ${n.sourceString}`;
                        error.pos = as.source.endIdx;
                        error.src = null;
                        throw error;
                    }
                    var params = new CodeStream();
                    var objectsString = new CodeStream();

                    params.addTab();
                    objectsString.addTab();
                    for (var i = 0; i < actuals.length; i++) {
                        var actual = actuals[i];
                        if (formals) {
                            var formal = formals.at(i);
                            var shortName = formal[2];
                            var isOther = myTable.usedAsOther(shortName);
                        } else {
                            var shortName = "t" + i;
                            isOther = false;
                        }

                        if (isOther) {
                            objectsString.tab();
                            objectsString.push(`objects["${shortName}"] = ${actual};\n`);
                        } else {
                            params.push(`params["${shortName}"] = ${actual};\n`);
                        }
                    }

                    var callProgram = `
(function() {
    var data = scripts["${n.sourceString}"];
    if (!data) {
        var error = new Error("semantic error");
        error.reason = "Method named ${n.sourceString} does not exist";
        error.expected = "Method named ${n.sourceString} does not exist";
        error.pos = ${_c.source.endIdx};
        error.src = null;
        throw error;
    }
    var func = data[0];
    var ins = data[1][0]; // [[name, <fieldName>]]
    var formals = data[1][1];
    var outs = data[1][2]; //[[object, <fieldName>]]
    var objects = {};
    objects.this = env["${r.sourceString}"];
    ${objectsString.contents()}
    var params = {};
    ${params.contents()}
    func(objects, outs, ins, params);
})()`;
                js.push(callProgram);
            },
        });
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
        constructor() {
            this.value = undefined;
            this.ready = false;
        }

        setValue(value) {
            this.value = value;
            this.ready = true;
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
                    maybeEntry[2] === entry[2]) {
                    return;
                } else {
                    throw "error duplicate variable" + k
                    return;
                }
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
            return found != null;
        }

        size() {
            return this.keys.length;
        }
    }

    class SymTable {
        constructor(entries, optIsPrimitive) {
            this.forBreed = true;
            this.hasBreedInput = false;
            this.hasPatchInput = false;
            this.defaultUniforms = null;
            this.defaultAttributes = null;

            this.usedHelpersAndPrimitives = new OrderedPair();   // foo(a) => foo -> foo
            this.type = optIsPrimitive ? "primitive" : "method";
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

            if (entries) {
                for (var i = 0; i < entries.length; i++) {
                    this.add.apply(this, (entries[i]))
                }
            }

            this.defaultUniforms = ["u_resolution", "u_half"];
            this.defaultAttributes = ["a_index", "b_index"];
        }

        beHelper() {
            this.type = "helper";
        }

        beStatic() {
            this.type = "static";
        }

        beEvent(name) {
            this.type = "event";
            this.eventName = name;
        }

        isEvent() {
            return this.type === "event";
        }

        beStaticVariable(name) {
            this.type = "staticVar";
            this.staticVarName = name;
        }

        isStaticVariable() {
            return this.type == "staticVar";
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
            // maybe a hack: look for outs that are not ins and add them to ins.  Those are use
            this.thisOut.keysAndValuesDo((key, entry) => {
                var newEntry = ["propIn", "this", entry[2]];
                var newK = newEntry.join(".");
                this.thisIn.add(newK, newEntry);
            });
            this.otherOut.keysAndValuesDo((key, entry) => {
                var newEntry = ["propIn", entry[1], entry[2]];
                var newK = newEntry.join(".");
                this.otherIn.add(newK, newEntry);
            });

            this.uniformTable.addAll(this.thisIn);
            this.uniformTable.addAll(this.otherIn);

            if (this.thisIn.size() > 0) {
                this.hasBreedInput = true;
            }
            if (this.otherIn.size() > 0) {
                this.hasPatchInput = true;
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

            if (this.forBreed) {
                this.varyingTable.addAll(this.thisOut);
            } else {
                this.varyingTable.addAll(this.otherOut);
            }
            this.param.keysAndValuesDo((key, entry) => {
                if (!this.usedAsOther(entry[2])) {
                    this.scalarParamTable.add(key, entry);
                }
            });
        };

        add(tag, rcvr, name) {
            var entry = [tag, rcvr, name];
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

            if ((this.otherOut.size() > 0 || this.otherIn.size() > 0) &&
                this.defaultUniforms.indexOf("u_that_x") < 0) {
                this.defaultUniforms = this.defaultUniforms.concat(["u_that_x", "u_that_y"]);
                if (dimension == 3) {
                    if (this.defaultUniforms.indexOf("u_that_z") < 0) {
                        this.defaultUniforms = this.defaultUniforms.concat(["u_that_z", "v_step", "v_resolution"]);
                    }
                }
            }
        }

        usedAsOther(n) {
            var result = false;
            this.otherIn.keysAndValuesDo((k, entry) => {
                result = result || (entry[1] === n);
            });
            this.otherOut.keysAndValuesDo((k, entry) => {
                result = result || (entry[1] === n);
            });
            return result;
        }

        uniform(entry) {
            var k = ["propIn", entry[1], entry[2]].join(".");
            var entry = this.uniformTable.at(k);
            if (!entry) {
                debugger;
            }
            return ["u", entry[1], entry[2]].join("_");
        }

        varying(entry) {
            var k = ["propOut", entry[1], entry[2]].join(".");
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
                                                          "uniform sampler2D " + this.uniform(entry) + ";");
        }

        paramUniforms() {
            var result = [];
            this.scalarParamTable.keysAndValuesDo((key, entry) => {
                result.push("uniform float u_scalar_" + entry[2] + ";");
            });
            return result;
        }

        vertVaryings() {
            return this.varyingTable.keysAndValuesCollect((key, entry) =>
                                                          "out float " + this.varying(entry) + ";");
        }

        fragVaryings() {
            return this.varyingTable.keysAndValuesCollect((key, entry) =>
                                                          "in float " + this.varying(entry) + ";");
        }

        uniformDefaults() {
            return this.varyingTable.keysAndValuesCollect((key, entry) => {
                var u_entry = ["propIn", entry[1], entry[2]];
                var ind = entry[1] === "this" ? `ivec2(a_index)` : `ivec2(_pos)`;
                return `${this.varying(entry)} = texelFetch(${this.uniform(u_entry)}, ${ind}, 0).r;`;
            })
        }

        outs() {
            var i = 0;
            var result = [];
            this.varyingTable.keysAndValuesDo((key, entry) => {
                result.push("layout (location = " + i + ") out float " + this.out(entry) + ";");
                i++;
            })
            return result;
        }

        fragColors() {
            return this.varyingTable.keysAndValuesCollect((key, entry) =>
                                                          this.out(entry) + " = " + this.varying(entry) + ";");
        }

        isBuiltin(n) {
            return this.defaultAttributes.indexOf(n) >= 0 || this.defaultUniforms.indexOf(n) >= 0 ;
        }

        hasVariable(n) {
            if (this.param.has(n)) {return true;}
            if (this.local.has(n)) {return true;}
            if (["this", "u_resolution", "u_half", "a_index", "b_index"].indexOf(n) >= 0) {
                return true;
            }
            return false;
        }

        insAndParamsAndOuts() {
            var ins = this.uniformTable.keysAndValuesCollect((key, entry) => [entry[1], entry[2]]);
            var shortParams = this.scalarParamTable.keysAndValuesCollect((key, entry) => entry[2]);
            var outs;
            if (this.forBreed) {
                outs = this.thisOut.keysAndValuesCollect((key, entry) => [entry[1], entry[2]]);
            } else {
                outs = this.otherOut.keysAndValuesCollect((key, entry) => [entry[1], entry[2]]);
            }
            return [ins, shortParams, outs];
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
        var symTable = n.symTable(null);
        return n.glsl(symTable, null, null);
    }

    var shadama;
    var defaultProgName = optDefaultProgName || "5-Bounce.shadama";

    standalone = !threeRenderer;
    renderer = threeRenderer;

    if (!renderer) {
        renderer = new StandAloneRenderer();

    }

    runTests = /test.?=/.test(window.location.search);
    showAllEnv = !(/allEnv=/.test(window.location.search));
    degaussdemo = /degaussdemo/.test(window.location.search);

    if (standalone) {
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

        if (runTests) {
            setTestParams();
            document.getElementById("bigTitle").innerHTML = "Shadama Tests";
        }

        readout = document.getElementById("readout");
        watcherList = document.getElementById("watcherList");
        envList = document.getElementById("envList");

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

        shadama = new Shadama();
        shadama.initDisplay();
        shadama.addListeners(shadamaCanvas);
        shadama.initServerFiles();
        shadama.initFileList();

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
                shadama.loadShadama(null, source);
                if (editor) {
                    editor.doc.setValue(source);
                }
                shadama.maybeRunner();
            };
            shadama.env["Display"].loadProgram(defaultProgName, func);
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
                shadama.env["Display"].loadProgram(defaultProgName);
                parent.onAfterRender = shadama.makeOnAfterRender();
            }
        });
    }

    initBreedVAO();
    initPatchVAO();
    initFramebuffers();

    programs["drawBreed"] = drawBreedProgram();
    programs["drawPatch"] = drawPatchProgram();
    programs["debugPatch"] = debugPatchProgram();
    programs["debugBreed"] = debugBreedProgram();
    programs["renderBreed"] = renderBreedProgram();
    programs["renderPatch"] = renderPatchProgram();
    programs["diffusePatch"] = diffusePatchProgram();
    programs["increasePatch"] = increasePatchProgram();
    programs["increaseVoxel"] = increaseVoxelProgram();

    initCompiler();

    if (runTests) {
        setTestParams(shadama.tester());
        grammarUnitTests();
        symTableUnitTests();
        translateTests();
    }
//    window.shadama = shadama;
    return shadama;
}

//export {
//   ShadamaFactory
//}
