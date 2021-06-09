/* globals CodeMirror THREE Papa ohm
        setTestParams
        grammarUnitTests
        symTableUnitTests
        translateTests
*/
/* SPECTOR */

import {join} from "./croquet.js";

export function ShadamaFactory(frame, optDimension, parent, optDefaultProgName, optDOMTools) {
    let threeRenderer = frame ? frame.renderer : null;
    let TEXTURE_SIZE = 1024;
    let FIELD_WIDTH = 512;
    let FIELD_HEIGHT = 512;

    let VOXEL_STEP = 8;
    let VOXEL_WIDTH = 512;
    let VOXEL_HEIGHT = 512;
    let VOXEL_DEPTH = 512;

    let VOXEL_TEXTURE_WIDTH = 512; // sqrt(512 * 512 * 512 / 8 / 8 / 8);
    let VOXEL_TEXTURE_HEIGHT = 512; // sqrt(512 * 512 * 512 / 8 / 8 / 8);

    let T = TEXTURE_SIZE;
    let FW = FIELD_WIDTH;
    let FH = FIELD_HEIGHT;

    let VS = VOXEL_STEP;
    let VW = VOXEL_WIDTH;
    let VH = VOXEL_HEIGHT;
    let VD = VOXEL_DEPTH;

    let VTW = VOXEL_TEXTURE_WIDTH;
    let VTH = VOXEL_TEXTURE_HEIGHT;

    let N = "_new_";

    let dimension = optDimension || 3; // 2 | 3;

    // need to change things around here so that you can have different Shadma instances with different sizes

    let breedVAO;
    let patchVAO;
    let programs = {};  // {name: {prog: shader, vao: VAO, uniLocations: uniformLocs}}

    let renderer;
    let gl;
    let state;
    let audioContext;

    let renderRequests = [];

    let targetTexture; // THREE.js texture, not WebGL texture

    let debugCanvas1;
    let debugArray;
    let debugArray1;
    let debugArray2;

    let debugTextureBreed;
    let debugTexturePatch;
    let framebufferDBreed;  // for debugging u8rgba texture
    let framebufferDPatch;  // for debugging u8rgba texture

    let framebufferBreed;
    let framebufferPatch;
    let framebufferDiffuse;
    let framebufferU8RGBA;  // for three js u8rgba texture

    let readFramebufferBreed;
    let readFramebufferPatch;
    let writeFramebufferBreed;
    let writeFramebufferPatch;

    let editor = null;
    let editorType = null;
    let parseErrorWidget = null;

    let domTools = false;

    let readout;
    let watcherList;  // DOM
    let watcherElements = []; // [DOM]
    let envList; // DOM

    let shadamaCanvas;
    let fullScreenScale = 1;

    let keepGoing = true;
    let animationRequested = false;

    let times = [];

    let withThreeJS;
    let runTests;
    let showAllEnv;
    let degaussdemo;
    let climatedemo;
    let useCroquet;

    let croquetView;

    let shaders = {
        "drawBreed.vert":
        `#version 300 es
        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;

        uniform vec2 u_resolution;
        uniform vec2 u_half;
        uniform float u_pointSize;

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
            gl_PointSize = u_pointSize;
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

        "copyRGBA.vert":
        `#version 300 es
        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;
        uniform vec2 u_resolution;
        uniform vec2 u_half;

        uniform ivec2 u_videoExtent;
        uniform sampler2D u_videoTexture;

        out vec4 v_value;
        void main(void) {
            ivec2 fc = ivec2(a_index);
            int w = int(u_resolution.x);
            int i = fc.y * w + fc.x;
            ivec2 vp = ivec2(i % w, i / u_videoExtent.x);
            vp.y = u_videoExtent.y - vp.y;

            vec2 clipPos = (b_index + u_half) * 2.0 - 1.0;  // (-1.0-1.0, -1.0-1.0)
            gl_Position = vec4(clipPos, 0.0, 1.0);
            gl_PointSize = 1.0;
            v_value = texelFetch(u_videoTexture, vp, 0);
        }`,

        "copyRGBA.frag":
        `#version 300 es
        precision highp float;
        in vec4 v_value;
        layout (location = 0) out float o_r;
        layout (location = 1) out float o_g;
        layout (location = 2) out float o_b;
        layout (location = 3) out float o_a;
        void main(void) {
            o_r = v_value.r;
            o_g = v_value.g;
            o_b = v_value.b;
            o_a = v_value.a;
        }`,
    };

    function initBreedVAO() {
        let allIndices = new Array(T * T * 2);
        let divIndices = new Array(T * T * 2);
        for (let j = 0; j < T; j++) {
            for (let i = 0; i < T; i++) {
                let ind = ((j * T) + i) * 2;
                allIndices[ind + 0] = i;
                allIndices[ind + 1] = j;
                divIndices[ind + 0] = i / T;
                divIndices[ind + 1] = j / T;
            }
        }

        breedVAO = gl.createVertexArray();
        gl.bindVertexArray(breedVAO);

        let aBuffer = gl.createBuffer();
        let bBuffer = gl.createBuffer();

        let attrLocations = new Array(2);
        attrLocations[0] = 0; // gl.getAttribLocation(prog, 'a_index'); a_index has layout location spec
        attrLocations[1] = 1; // gl.getAttribLocation(prog, 'b_index'); b_index has layout location spec

        let attrStrides = new Array(2);
        attrStrides[0] = 2;
        attrStrides[1] = 2;

        setBufferAttribute([aBuffer, bBuffer], [allIndices, divIndices], attrLocations, attrStrides);
        gl.bindVertexArray(null);
    }

    function initPatchVAO() {
        let w;
        let h;
        if (dimension === 2) {
            w = FW;
            h = FH;
        } else {
            w = VTW;
            h = VTH;
        }
        let allIndices = new Array(w * h * 2);
        let divIndices = new Array(w * h * 2);
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                let ind = ((j * w) + i) * 2;
                allIndices[ind + 0] = i;
                allIndices[ind + 1] = j;
                divIndices[ind + 0] = i / w;
                divIndices[ind + 1] = j / h;
            }
        }

        patchVAO = gl.createVertexArray();
        gl.bindVertexArray(patchVAO);

        let aBuffer = gl.createBuffer();
        let bBuffer = gl.createBuffer();

        let attrLocations = [0, 1];
        attrLocations[0] = 0; // gl.getAttribLocation(prog, 'a_index'); a_index has layout location spec
        attrLocations[1] = 1; // gl.getAttribLocation(prog, 'b_index'); b_index has layout location spec

        let attrStrides = [2, 2];

        setBufferAttribute([aBuffer, bBuffer], [allIndices, divIndices], attrLocations, attrStrides);
        gl.bindVertexArray(null);
    }

    function makePrimitive(name, uniforms, vao) {
        let vs = createShader(name + ".vert", shaders[name+'.vert']);
        let fs = createShader(name + ".frag", shaders[name+'.frag']);

        let prog = createProgram(vs, fs);

        let uniLocations = {};
        uniforms.forEach(function (n) {
            uniLocations[n] = gl.getUniformLocation(prog, n);
        });

        return {program: prog, uniLocations, vao};
    }

    function drawBreedProgram() {
        return makePrimitive("drawBreed", ["u_resolution", "u_half", "u_pointSize", "u_x", "u_y", "u_r", "u_g", "u_b", "u_a"], breedVAO);
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

    function copyRGBAProgram() {
        return makePrimitive("copyRGBA", ["u_resolution", "u_half", "u_videoExtent", "u_videoTexture"], breedVAO);
    }

    function createShader(id, source) {
        let type;
        if (id.endsWith(".vert")) {
            type = gl.VERTEX_SHADER;
        } else if (id.endsWith(".frag")) {
            type = gl.FRAGMENT_SHADER;
        }

        let shader = gl.createShader(type);

        if (!source) {
            let scriptElement = document.getElementById(id);
            if(!scriptElement){return null;}
            source = scriptElement.text;
        }
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        let success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (success) {
            return shader;
        }
        console.log(source);
        console.log(gl.getShaderInfoLog(shader));
        alert(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    function createProgram(vertexShader, fragmentShader) {
        let program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        let success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (success) {
            return program;
        }

        console.log(gl.getProgramInfoLog(program));
        //    alert(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
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

        let tex = gl.createTexture();
        state.bindTexture(gl.TEXTURE_2D, tex);

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, false);

        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, width);
        gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, height);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, 0);

        if (type === gl.UNSIGNED_BYTE) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, type, data, 0);
        } else if (type === gl.R32F) {
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

        /*
        let tex;
        if (format === gl.FLOAT) {
            tex = createTexture(new Float32Array(width * height * 4), format, width, height);
        }
        if (format === gl.R32F) {
            tex = createTexture(new Float32Array(width * height), format, width, height);
        }
        if (format === gl.UNSIGNED_BYTE) {
            tex = createTexture(new Uint8Array(width * height * 4), format, width, height);
        }
*/

        var buffer = gl.createFramebuffer();

        /*
        state.bindFramebuffer(gl.FRAMEBUFFER, buffer);
        state.bindTexture(gl.TEXTURE_2D, tex);

        if (format === gl.R32F) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, null);
        } else if (format === gl.UNSIGNED_BYTE) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, format, null);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, format, null);
        }
        state.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

*/

        if (withThreeJS) {
            var target = new THREE.WebGLRenderTarget(width, height);
            renderer.properties.get(target).__webglFramebuffer = buffer;
            //gl.deleteTexture(tex); // has to be revisited
            return target;
        }
        return buffer;
    }

    function setTargetBuffer(buffer, tex) {
        renderer.setRenderTarget(buffer);
        if (buffer) {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        }
    }

    function setTargetBuffers(buffer, tex) {
        if (!buffer) {
            gl.drawBuffers([]);
            renderer.setRenderTarget(null, gl.DRAW_FRAMEBUFFER);
            return;
        }

        let list = [];

        renderer.setRenderTarget(buffer, gl.DRAW_FRAMEBUFFER);
        for (let i = 0; i < tex.length; i++) {
            let val = gl.COLOR_ATTACHMENT0 + i;
            gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, val, gl.TEXTURE_2D, tex[i], 0);
            list.push(val);
        }
        gl.drawBuffers(list);
    }

    function setBufferAttribute(buffers, data, attrL, attrS) {
        for (let i in buffers) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers[i]);
            gl.bufferData(gl.ARRAY_BUFFER,
                          new Float32Array(data[i]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(attrL[i]);
            gl.vertexAttribPointer(attrL[i], attrS[i], gl.FLOAT, false, 0, 0);
        }
    }

    function webglTexture() {
        return withThreeJS ? (targetTexture && renderer.properties.get(targetTexture).__webglTexture || null) : null;
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
        let w;
        let h;
        let readbuffer;
        let writebuffer;

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
        let width;
        let height;
        if (obj.constructor === Breed) {
            width = T;
            height = T;
        } else if (obj.constructor === Patch) {
            width = FW;
            height = FH;
        } else {
            width = VTW;
            height = VTH;
        }

        let ary = optData || new Float32Array(width * height);

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

    function update(Cls, name, fields, env) {
        let stringify = (obj) => {
            let type = Object.prototype.toString.call(obj);
            if (type === "[object Object]") {
                let pairs = [];
                for (let k in obj) {
                    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
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

        let obj = env[name];
        if (!obj) {
            obj = new Cls();
            for (let i = 0; i < fields.length; i++) {
                updateOwnVariable(obj, fields[i]);
            }
            env[name] = obj;
            return true;
        }

        let oldOwn = obj.own;
        let toBeDeleted = [];  // [<str>]
        let toBeCreated = [];  // [<str>]
        let newOwn = {};

        // common case: when the existing own and fields are the same
        for (let i = 0; i < fields.length; i++) {
            let k = fields[i];
            newOwn[k] = k;
        }
        if (stringify(newOwn) === stringify(oldOwn)) {
            return false;
        }

        // other case: get things into toBeDeleted and toBeCreated, and toBeMoved
        for (let k in oldOwn) {
            if (fields.indexOf(k) < 0) {
                toBeDeleted.push(k);
            }
        }
        for (let i = 0; i < fields.length; i++) {
            let k = fields[i];
            if (!oldOwn[k]) {
                toBeCreated.push(k);
            }
        }

        toBeCreated.forEach((k) => updateOwnVariable(obj, k));
        toBeDeleted.forEach((k) => removeOwnVariable(obj, k));
        return true;
    }

    function programFromTable(table, vert, frag, name) {
        let debugName = name;
        if (debugName === "move") {
        }
        let prog = createProgram(createShader(name + ".vert", vert),
                                 createShader(name + ".frag", frag));
        let vao = breedVAO;
        let uniLocations = {};

        let forBreed = table.forBreed;
        let viewportW = forBreed ? T : FW;
        let viewportH = forBreed ? T : FH;
        let hasPatchInput = table.hasPatchInput;

        table.defaultUniforms.forEach(function(n) {
            uniLocations[n] = gl.getUniformLocation(prog, n);
        });

        table.uniformTable.keysAndValuesDo((key, entry) => {
            let uni = table.uniform(entry);
            uniLocations[uni] = gl.getUniformLocation(prog, uni);
        });

        table.scalarParamTable.keysAndValuesDo((key, entry) => {
            let val = entry[2];
            let uni = "u_scalar_" + val;
            uniLocations[uni] = gl.getUniformLocation(prog, uni);
        });

        return function(objects, outs, ins, params) {
            // objects: {varName: object}
            // outs: [[varName, fieldName]]
            // ins: [[varName, fieldName]]
            // params: {shortName: value}
            if (debugName === "move") {
            }
            let object = objects["this"];

            let targets = outs.map((pair) => objects[pair[0]][N + pair[1]]);
            if (forBreed) {
                if (framebufferBreed) {
                    gl.deleteFramebuffer(framebufferBreed);
                    framebufferBreed = null;
                }
                framebufferBreed = makeFramebuffer(gl.R32F, T, T);
                setTargetBuffers(framebufferBreed, targets);
            } else {
                outs.forEach((pair) => {
                    textureCopy(objects[pair[0]],
                                objects[pair[0]][pair[1]],
                                objects[pair[0]][N + pair[1]]);
                });
                if (framebufferPatch) {
                    gl.deleteFramebuffer(framebufferPatch);
                }
                framebufferPatch = makeFramebuffer(gl.R32F, FW, FH);
                setTargetBuffers(framebufferPatch, targets);
            }

            state.useProgram(prog);
            gl.bindVertexArray(vao);
            noBlend();

            if (!withThreeJS) {
                gl.viewport(0, 0, viewportW, viewportH);
            }

            if (uniLocations["u_resolution"]) {
                gl.uniform2f(uniLocations["u_resolution"], FW, FH);
            }
            gl.uniform2f(uniLocations["u_half"], 0.5/viewportW, 0.5/viewportH);

            let offset = 0;
            if (!forBreed || hasPatchInput) {
                state.activeTexture(gl.TEXTURE0);
                state.bindTexture(gl.TEXTURE_2D, object.x);
                gl.uniform1i(uniLocations["u_that_x"], 0);

                state.activeTexture(gl.TEXTURE1);
                state.bindTexture(gl.TEXTURE_2D, object.y);
                gl.uniform1i(uniLocations["u_that_y"], 1);
                offset = 2;
            }

            let ind = 0;

            for (ind = 0; ind < ins.length; ind++) {
                let pair = ins[ind];
                let glIndex = gl.TEXTURE0 + ind + offset;
                let k = pair[1];
                let val = objects[pair[0]][k];
                state.activeTexture(glIndex);
                state.bindTexture(gl.TEXTURE_2D, val);
                gl.uniform1i(uniLocations[["u", pair[0], k].join("_")], ind + offset);
            }

            for (let k in params) {
                let val = params[k];
                if (val.constructor === WebGLTexture) {
                    let glIndex = gl.TEXTURE0 + ind + offset;
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

            if (forBreed) {
                gl.deleteFramebuffer(framebufferBreed);
                framebufferBreed = null;
            } else {
                gl.deleteFramebuffer(framebufferPatch);
                framebufferPatch = null;
            }

            for (let i = 0; i < outs.length; i++) {
                let pair = outs[i];
                let o = objects[pair[0]];
                let n = pair[1];
                let tmp = o[n];
                o[n] = o[N + n];
                o[N + n] = tmp;
            }
            gl.bindVertexArray(null);
        };
    }

    function programFromTable3(table, vert, frag, name) {
        let debugName = name;
        if (debugName === "setCoreColor") {
        }
        let prog = createProgram(createShader(name + ".vert", vert),
                                     createShader(name + ".frag", frag));
        let vao = breedVAO;
        let uniLocations = {};

        let forBreed = table.forBreed;
        let viewportW = forBreed ? T : VTW;
        let viewportH = forBreed ? T : VTH;
        let hasPatchInput = table.hasPatchInput;

        table.defaultUniforms.forEach(function(n) {
            uniLocations[n] = gl.getUniformLocation(prog, n);
        });

        table.uniformTable.keysAndValuesDo((key, entry) => {
            let uni = table.uniform(entry);
            uniLocations[uni] = gl.getUniformLocation(prog, uni);
        });

        table.scalarParamTable.keysAndValuesDo((key, entry) => {
            let val = entry[2];
            let uni = "u_scalar_" + val;
            uniLocations[uni] = gl.getUniformLocation(prog, uni);
        });

        return function(objects, outs, ins, params) {
            // objects: {varName: object}
            // outs: [[varName, fieldName]]
            // ins: [[varName, fieldName]]
            // params: {shortName: value}
            if (debugName === "setCoreColor") {
            }
            let object = objects["this"];

            let targets = outs.map((pair) => objects[pair[0]][N + pair[1]]);
            if (forBreed) {
                if (framebufferBreed) {
                    gl.deleteFramebuffer(framebufferBreed);
                    framebufferBreed = null;
                }
                framebufferBreed = makeFramebuffer(gl.R32F, T, T);
                setTargetBuffers(framebufferBreed, targets);
            } else {
                outs.forEach((pair) => {
                    textureCopy(objects[pair[0]],
                                objects[pair[0]][pair[1]],
                                objects[pair[0]][N + pair[1]]);
                });

                if (framebufferPatch) {
                    gl.deleteFramebuffer(framebufferPatch);
                }
                framebufferPatch = makeFramebuffer(gl.R32F, FW, FH);
                setTargetBuffers(framebufferPatch, targets);
            }

            state.useProgram(prog);
            gl.bindVertexArray(vao);
            noBlend();

            gl.uniform3f(uniLocations["u_resolution"], VW, VH, VD);
            gl.uniform3f(uniLocations["v_resolution"], VW/VS, VH/VS, VD/VS);
            gl.uniform1f(uniLocations["v_step"], VS);
            gl.uniform2f(uniLocations["u_half"], 0.5/viewportW, 0.5/viewportH);

            let offset = 0;
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

            let ind;
            for (ind = 0; ind < ins.length; ind++) {
                let pair = ins[ind];
                let glIndex = gl.TEXTURE0 + ind + offset;
                let k = pair[1];
                let val = objects[pair[0]][k];
                state.activeTexture(glIndex);
                state.bindTexture(gl.TEXTURE_2D, val);
                gl.uniform1i(uniLocations[["u", pair[0], k].join("_")], ind + offset);
            }

            for (let k in params) {
                let val = params[k];
                if (val.constructor === WebGLTexture) {
                    let glIndex = gl.TEXTURE0 + ind + offset;
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

            if (forBreed) {
                gl.deleteFramebuffer(framebufferBreed);
                framebufferBreed = null;
            } else {
                gl.deleteFramebuffer(framebufferPatch);
                framebufferPatch = null;
            }

            for (let i = 0; i < outs.length; i++) {
                let pair = outs[i];
                let o = objects[pair[0]];
                let n = pair[1];
                let tmp = o[n];
                o[name] = o[N + n];
                o[N + n] = tmp;
            }
            gl.bindVertexArray(null);
        };
    }

    function initFramebuffers() {
        debugTextureBreed = createTexture(new Float32Array(T*T*4), gl.FLOAT, T, T);
        debugTexturePatch = createTexture(new Float32Array(FW*FH*4), gl.FLOAT, FW, FH);

        //framebufferBreed = makeFramebuffer(gl.R32F, T, T);
        //framebufferPatch = makeFramebuffer(gl.R32F, FW, FH);

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
        this.media = {}; // {name: ShadamaTrigger}

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

        let f = new Function("env", "scripts", 'return ' + source);
        let val = f(this.env, this.scripts);
        return val;
    };

    Shadama.prototype.loadShadama = function(id, source) {
        let newSetupCode;
        let oldProgramName = this.programName;
        let schemaChange = false;
        this.statics = {};
        this.staticsList = [];
        this.scripts = {};
        this.triggers = {};
        this.clearMedia();
        let newData = [];
        if (!source) {
            let scriptElement = document.getElementById(id);
            if(!scriptElement){return "";}
            source = scriptElement.text;
        }
        this.cleanUpEditorState();
        let result;
        try {
            result = translate(source, "TopLevel", this.reportError.bind(this));
        } catch (e) {
            this.reportError(e);
            return null;
        }
        this.compilation = result;

        if (!result) {return "";}
        if (oldProgramName !== result["_programName"]) {
            this.resetSystem();
        }
        this.programName = result["_programName"];
        delete result["_programName"];

        for (let k in result) {
            let entry = result[k];
            if (entry[0] === "static") { // static function case
                let src = entry[2];
                let js = entry[1];
                this.statics[k] = this.evalShadama(js);
                this.staticsList.push(k);
                this.env[k] = new ShadamaFunction(k, this);
                if (k === "setup") {
                    newSetupCode = src;
                }
            } else {
                let js = entry[3];
                if (js[0] === "updateBreed") {
                    schemaChange = update(Breed, js[1], js[2], this.env) || schemaChange;
                } else if (js[0] === "updatePatch") {
                    schemaChange = update(Patch, js[1], js[2], this.env) || schemaChange;
                } else if (js[0] === "updateScript") {
                    let table = entry[0];
                    let func = dimension === 2 ? programFromTable : programFromTable3;
                    this.scripts[js[1]] = [ func(table, entry[1], entry[2], js[1]),
                                      table.insAndParamsAndOuts()];
                } else if (js[0] === "event") {
                    this.env[js[1]] = new ShadamaEvent();
                } else if (js[0] === "trigger") {
                    this.triggers[k] = new ShadamaTrigger(js[1], js[2]);
                } else if (js[0] === "data") {
                    this.env[js[1]] = new ShadamaEvent();
                    if (js[3] === "image") {
                        this.env[js[1]] = this.loadImage(js[2]);
                    } else if (js[3] === "audio") {
                        this.env[js[1]] = this.loadAudio(js[2]);
                    } else if (js[3] === "csv") {
                        this.env[js[1]] = this.loadCSV(js[2]);
                    } else if (js[3] === "video" || js[3] === "camera") {
                        var evt = this.loadVideo(js[2], js[3] === "camera");
                        this.env[js[1]] = evt;
                        this.media[js[1]] = evt;
                    }

                    if (newData.length === 0) {
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
                let success = this.callSetup();
                if (!success) {return null;}
            } else {
                this.loadTime = window.performance.now() / 1000.0;
                this.env["time"] = 0.0;
                let trigger = new ShadamaTrigger(newData, ["step", "setup"]);
                this.triggers["_trigger" + trigger.trigger.toString()] = trigger;
            }
        }
//        this.runLoop();
        return source;
    };

    Shadama.prototype.setTarget = function(aTexture) {
        targetTexture = aTexture;
    };

    Shadama.prototype.setReadPixelCallback = function(func) {
        this.readPixelCallback = func;
    };

    Shadama.prototype.makeOnAfterRender = function() {
        return function(_renderer, scene, camera, _geometry, _material, _group) {
            let mesh = this;
            let pMatrix = camera.projectionMatrix;
            let mvMatrix = mesh.modelViewMatrix;
           // mvpMatrix.multiply(modelViewMatrix);

            for (let i = 0; i < renderRequests.length; i++) {
                let item = renderRequests[i];
                if (item.constructor === Breed || item.constructor === Patch) {
                    item.realRender(mvMatrix, pMatrix);
                }
            }
            renderRequests.length = 0;
        };
    };

    Shadama.prototype.readPixels = function() {
        let width = FW;
        let height = FH;

        if (!this.readPixelArray) {
            this.readPixelArray = new Uint8Array(width * height * 4);
        }
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, this.readPixelArray);

        let clamped = new Uint8ClampedArray(this.readPixelArray);
        let img = new ImageData(clamped, width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return img;
    };

    Shadama.prototype.debugDisplay = function(objName, name) {
        let object = this.env[objName];
        let forBreed = object.constructor === Breed;
        let width = forBreed ? T : FW;
        let height = forBreed ? T : FH;

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

        let prog = programs[forBreed ? "debugBreed" : "debugPatch"];

        if (forBreed) {
            setTargetBuffer(framebufferDBreed, debugTextureBreed);
        } else {
            setTargetBuffer(framebufferDPatch, debugTexturePatch);
        }

        state.useProgram(prog.program);
        gl.bindVertexArray(prog.vao);

        let tex = object[name];

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
        debugArray1 = new Float32Array(width * height);
        debugArray2 = new Uint8ClampedArray(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, debugArray, 0);

        for (let i = 0; i < width * height; i++) {
            debugArray1[i] = debugArray[i * 4 + 0];
        }

        for (let i = 0; i < width * height; i++) {
            debugArray2[i * 4 + 0] = debugArray[i * 4 + 0] * 255;
            debugArray2[i * 4 + 1] = debugArray[i * 4 + 1] * 255;
            debugArray2[i * 4 + 2] = debugArray[i * 4 + 2] * 255;
            debugArray2[i * 4 + 3] = debugArray[i * 4 + 3] * 255;
        }

        let img = new ImageData(debugArray2, width, height);
        debugCanvas1.getContext("2d").putImageData(img, 0, 0);
        setTargetBuffer(null, null);

        gl.bindVertexArray(null);
        return debugArray1;
    };

    Shadama.prototype.readValues = function(object, name, x, y, w, h) {
        let forBreed = object.constructor === Breed;
        let maxWidth = forBreed ? T : FW;
        let maxHeight = forBreed ? T : FH;

        if (x < 0 || y < 0 || x >= maxWidth || y >= maxHeight
            || x + w >= maxWidth || y + h >= maxHeight) {
            let error = new Error("runtime error");
            error.reason = `coordiate is out of bounds`;
            error.expected = `coordiate is out of bounds`;
            error.pos = -1;
            error.src = null;
            throw error;
        }

        let prog = programs[forBreed ? "debugBreed" : "debugPatch"];

        if (forBreed) {
            setTargetBuffer(framebufferDBreed, debugTextureBreed);
        } else {
            setTargetBuffer(framebufferDPatch, debugTexturePatch);
        }

        state.useProgram(prog.program);
        gl.bindVertexArray(prog.vao);

        let tex = object[name];

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

        if (w === 1 && h === 1) {
            return debugArray[0];
        }

        for (let i = 0; i < w * h; i++) {
            debugArray1[i] = debugArray[i * 4 + 0];
        }

        return debugArray1;
    };

    Shadama.prototype.resetSystem = function() {
        for (let s in this.steppers) {
            let e = this.detectEntry(s);
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

        for (let o in this.env) {
            let obj = this.env[o];
            if (typeof obj === "object" && (obj.constructor === Breed || obj.constructor === Patch)) {
                for (let k in obj.own) {
                    let tex = obj[k];
                    if (tex.constructor === WebGLTexture) {
                        gl.deleteTexture(obj[k]);
                    }
                }
                delete this.env[o];
            }
        }
    };

    Shadama.prototype.updateCode = function() {
        if (!editor) {return;}
        let code = editor.getValue();
        this.loadShadama(null, code);
        this.maybeRunner();
        if (!this.programName) {
            this.programName = prompt("Enter the program name:", "My Cool Effect!");
            if (!this.programName) {
                alert("program not saved");
                return;
            }
            code = `program " ${this.programName}"\n${code}`;
            editor.setValue(code);
        }
        localStorage.setItem(this.programName + ".shadama", code);
        this.initFileList(this.programName);
    };

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
    };

    Shadama.prototype.addListeners = function(aCanvas) {
        if (!domTools) {return;}
        let set = (e, symbol) => {
            var x = e.offsetX;
            var y = FH - e.offsetY;
            //  console.log("y " + e.clientY + " top " + top + " pageY: " + e.pageY);
            //  console.log("x " + x + " y: " + y);
            this.env[symbol] = {x,  y, time: this.env["time"]};
        };

        aCanvas.addEventListener("mousemove", (e) => set(e, "mousemove"));
        aCanvas.addEventListener("mousedown", (e) => set(e, "mousedown"));
        aCanvas.addEventListener("mouseup", (e) => set(e, "mouseup"));
        document.addEventListener('keypress', (evt) => {
            if (evt.target === document.body) {
                if (evt.key === '`') {
                    this.callSetup();
                } else if (evt.key === "!") {
                    this.toggleScript("loop");
                } else if (evt.key === "\\") {
                    if (climatedemo) {
                        this.setClimateFullScreen();
                    }
                }
            }
        }, true);
    };

    Shadama.prototype.initServerFiles = function() {
        if (!editor) {return;}
        let examples = [
            "1-Fill.shadama", "2-Disperse.shadama", "3-Gravity.shadama", "4-Two Circles.shadama", "5-Bounce.shadama", "6-Picture.shadama", "7-Duck Bounce.shadama", "8-Back and Forth.shadama", "9-Mandelbrot.shadama", "10-Life Game.shadama", "11-Ball Gravity.shadama", "12-Duck Gravity.shadama", "13-Ribbons.shadama", "16-Diffuse.shadama", "19-Bump.shadama", "21-ForestFire.shadama", "22-WhoAmI.shadama", "23-Camera.shadama", "24-Minsky.shadama", "25-2DSystem.shadama"
        ];
        examples.forEach((n) => {
            this.env["Display"].loadProgram(n, (serverCode) => {
                //let localCode = localStorage.getItem(n);
                //if (!localCode) {
                    localStorage.setItem(n, serverCode);
                //}
                this.initFileList();
            });
        });
    };

    Shadama.prototype.loadAudio = function(name) {
        let event = new ShadamaEvent();
        let location = window.location.toString();

        if (!audioContext) {
            audioContext = new AudioContext();
        }

        let loadSound = (url) => {
            let request = new XMLHttpRequest();
            request.open('GET', url, true);
            request.responseType = 'arraybuffer';

            // Decode asynchronously
            request.onload = () => {
                audioContext.decodeAudioData(request.response,
                                             (buffer) => {
                                                 event.setValue(buffer);
                                             },
                                             (error) => {
                                                 console.log(error);
                                                 event.setValue("");
                                             });
            };
            request.send();
        };

        if (location.startsWith("http")) {
            let slash = location.lastIndexOf("/");
            loadSound(location.slice(0, slash) + "/" + name);
        } else {
            loadSound("http://tinlizzie.org/~ohshima/shadama2/" + name);
        }
        return event;
    };

    Shadama.prototype.loadImage = function(name) {
        let event = new ShadamaEvent();

        let img = document.createElement("img");
        let tmpCanvas = document.createElement("canvas");
        let location = window.location.toString();

        let dir;

        if (location.startsWith("http")) {
            if (frame) {
                dir = frame.imagePath + name;
            } else {
                let slash = location.lastIndexOf("/");
                dir = location.slice(0, slash) + "/" + name;
            }
            img.src = dir;
        } else {
            img.crossOrigin = "Anonymous";
            img.onerror = () => {
                console.log("no internet");
                let newImage = this.emptyImageData(256, 256);
                document.body.removeChild(img);
                event.setValue(newImage);
            };
            img.src = "http://tinlizzie.org/~ohshima/shadama2/" + name;
        }

        img.hidden = true;

        img.onload = () => {
            tmpCanvas.width = img.width;
            tmpCanvas.height = img.height;
            tmpCanvas.getContext('2d').drawImage(img, 0, 0);
            let newImage = tmpCanvas.getContext('2d').getImageData(0, 0, img.width, img.height);
            document.body.removeChild(img);
            event.setValue(newImage);
        };
        document.body.appendChild(img);
        return event;
    };

    Shadama.prototype.loadCSV = function(name) {
        let xobj = new XMLHttpRequest();
        let event = new ShadamaEvent();
        let location = window.location.toString();
        let dir;
        if (name.startsWith("http")) {
            dir = name;
        } else {
            if (location.startsWith("http")) {
                if (frame) {
                    dir = frame.dataPath + name;
                } else {
                    let slash = location.lastIndexOf("/");
                    dir = location.slice(0, slash) + "/" + name;
                }
            } else {
                dir = "http://tinlizzie.org/~ohshima/shadama2/" + name;
            }
        }
        xobj.open("GET", dir, true);
        xobj.responseType = "blob";

        let errorCSV = (error, file) => {
            console.log("ERROR:", error, file);
            event.setValue("");
        };

        let resultCSV = (result) => {
            var data = result.data;
            event.setValue(data);
        };

        xobj.onload = function(_oEvent) {
            let blob = xobj.response;
            let file = new File([blob], dir);
            Papa.parse(file, {complete: resultCSV, error: errorCSV});
        };

        xobj.send();
        return event;
    };

    Shadama.prototype.loadVideo = function(name, isCamera) {
        let event = new ShadamaEvent(); //event to trigger that a frame is ready
        let video = document.createElement("video");

        function initTexture() {
            let texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);

            // Because video has to be download over the internet
            // they might take a moment until it's ready so
            // put a single pixel in the texture so we can
            // use it immediately.
            let pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                          1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                          pixel);

            // Turn off mips and set  wrapping to clamp to edge so it
            // will work regardless of the dimensions of the video.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            return texture;
        }

        var videoTexture = initTexture();

        let updateTexture = (_gl, texture, _video) => {
            state.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                          gl.RGBA, gl.UNSIGNED_BYTE, video);
        };

        let playing = false;
        let timeupdate = false;

        video.autoplay = true;
        video.muted = true;
        video.loop = true;

        video.addEventListener('playing', () => {
            playing = true;
        }, true);

        video.addEventListener('timeupdate', () => {
            timeupdate = true;
        }, true);

        let checkReady = () => playing && timeupdate;

        video.hidden = true;
        //document.body.appendChild(video);

        if (isCamera) {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                // Not adding `{ audio: true }` since we only want video now
                navigator.mediaDevices.getUserMedia({ video: true }).then(function(stream) {
                    video.srcObject = stream; //window.URL.createObjectURL(stream);
                    video.play();
                });
            }
        } else {
            let location = window.location.toString();
            let dir;
            if (location.startsWith("http")) {
                if (frame) {
                    dir = frame.imagePath + name;
                } else {
                    let slash = location.lastIndexOf("/");
                    dir = location.slice(0, slash) + "/" + name;
                }
                video.src = dir;
            } else {
                video.crossOrigin = "Anonymous";
                video.onerror = () => {
                    console.log("no internet");
                };
                video.src = "http://tinlizzie.org/~ohshima/shadama2/" + name;
            }
            video.play().then(() => {
                console.log("Automatic playback started!");
            }).catch((_error) => {
                console.log("Automatic playback failed!");
            });
        }

        event.setValue({updateTexture, video, texture: videoTexture, checkReady});
        return event;
    };

    Shadama.prototype.clearMedia = function() {
        for (let k in this.media) {
            let event = this.media[k];
            let value = event.value;
            if (value.video) {
                value.video.pause();
                value.video.remove();
            }
        }
        this.media = {};
    };

    Shadama.prototype.initDisplay = function() {
        this.env["Display"] = new Display(this);
    };

    Shadama.prototype.initEnv = function(callback) {
        this.env.mousedown = {x: 0, y: 0};
        this.env.mousemove = {x: 0, y: 0};
        this.env.width = FW;
        this.env.height = FH;

        callback();
    };

    Shadama.prototype.makeClock = function() {
        let aClock = document.createElement("canvas");
        aClock.width = 40;
        aClock.height = 40;
        aClock.ticking = false;
        aClock.hand = 0;
        this.drawClock(aClock, 0, false);

        aClock.onclick = () => this.toggleScript(aClock.entry.scriptName);
        return aClock;
    };

    Shadama.prototype.stopClock = function(aClock) {
        aClock.ticking = false;
        this.drawClock(aClock);
    };

    Shadama.prototype.startClock = function(aClock) {
        aClock.ticking = true;
        this.drawClock(aClock);
    };

    Shadama.prototype.stopScript = function(name) {
        delete this.steppers[name];
        let entry = this.detectEntry(name);
        if (entry) {
            this.stopClock(entry.clock);
        }
    };

    Shadama.prototype.startScript = function(name) {
        this.steppers[name] = name;
        let entry = this.detectEntry(name);
        if (entry) {
            this.startClock(entry.clock);
        }
    };

    Shadama.prototype.toggleScript = function(name) {
        if (this.steppers[name]) {
            this.stopScript(name);
        } else {
            this.startScript(name);
        }
    };

    Shadama.prototype.drawClock = function(aClock) {
        let hand = aClock.hand;
        let ticking = aClock.ticking;
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
        }

        function drawHand(ctx, length, dir) {
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.moveTo(0, 0);
            ctx.rotate(dir);
            ctx.lineTo(0, -length);
            ctx.stroke();
        }

        let ctx = aClock.getContext('2d');
        let backColor = ticking ? '#ffcccc' : '#ffffff';
        let dir = hand / 360.0 * (Math.PI * 2.0);

        ctx.transform(1, 0, 0, 1, 18, 18);
        drawFace(aClock.getContext('2d'), 16, backColor);
        drawHand(aClock.getContext('2d'), 10, dir);
        ctx.resetTransform();
    };

    Shadama.prototype.makeEntry = function(name) {
        if (!domTools) {return null;}
        let entry = document.createElement("div");
        let aClock = this.makeClock();
        entry.scriptName = name;
        entry.appendChild(aClock);
        entry.clock = aClock;
        aClock.entry = entry;
        let button = document.createElement("div");
        button.className = "staticName";
        button.innerHTML = name;
        button.onclick = () => {
            this.env["time"] = (window.performance.now() / 1000) - this.loadTime;
            if (this.statics[entry.scriptName]) {
                try {
                    this.statics[entry.scriptName](this.env);
                } catch (e) {
                    this.reportError(e);
                }
            }
        };
        entry.appendChild(button);
        return entry;
    };

    Shadama.prototype.detectEntry = function(name) {
        if (!domTools) {return null;}
        for (let j = 0; j < watcherList.children.length; j++) {
            let oldEntry = watcherList.children[j];
            if (oldEntry.scriptName === name) {return oldEntry;}
        }
        return null;
    };

    Shadama.prototype.removeAll = function() {
        if (!domTools) {return;}
        while (watcherList.firstChild) {
            watcherList.removeChild(watcherList.firstChild);
        }
    };

    Shadama.prototype.addAll = function(elems) {
        if (!domTools) {return;}
        for (let j = 0; j < elems.length; j++) {
            watcherList.appendChild(elems[j]);
        }
    };

    Shadama.prototype.updateClocks = function() {
        if (!domTools) {return;}
        for (let j = 0; j < watcherList.children.length; j++) {
            let child = watcherList.children[j];
            let aClock = child.clock;
            if (aClock.ticking) {
                aClock.hand = (aClock.hand + 2) % 360;
            }
            this.drawClock(aClock);
        }
    };

    Shadama.prototype.selectFile = function(dom) {
        if (dom.selectedIndex > 0) {// 0 is for the default label
            let option = dom.options[dom.selectedIndex];
            let name = option.label;
            let source = localStorage.getItem(name);
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
    };

    Shadama.prototype.initFileList = function(optSelection) {
        if (optSelection) {
            if (!optSelection.endsWith(".shadama")) {
                optSelection += ".shadama";
            }
        }
        let dom = document.getElementById("myDropdown");
        dom.onchange = () => {this.selectFile(dom);};
        let selectIndex = null;
        if (localStorage) {
            let list = Object.keys(localStorage).filter((k) => k.endsWith(".shadama"));
            list.sort((a, b) => {
                let aVal = parseFloat(a);
                let bVal = parseFloat(b);
                if (a === 0) {return -1;}
                if (b === 0) {return 1;}
                return aVal - bVal;
            });
            dom.options.length = 0;
            dom.options[0] = new Option("Choose a File:", 0);
            for (let i = 0; i < list.length; i++) {
                dom.options[dom.options.length] = new Option(list[i], i + 1);
                if (optSelection && list[i] === optSelection) {
                    selectIndex = i + 1;
                }
            }
            if (selectIndex) {
                dom.selectedIndex = selectIndex;
            }
        }
    };

    Shadama.prototype.updateEnv = function() {
        let printNum = (obj) => {
            if (typeof obj !== "number") return obj;
            let str = Math.abs(obj) < 1 ? obj.toPrecision(3) : obj.toFixed(3);
            return str.replace(/\.0*$/, "");
        };

        let print = (obj) => {
            if (typeof obj !== "object") return printNum(obj);
            if (typeof obj === "object" && obj.constructor === ShadamaEvent) return print(obj.value);
            let props = Object.getOwnPropertyNames(obj)
                .filter((k) => typeof obj[k] !== "object")
                .map((k)=>`${k}:${printNum(obj[k])}`);
            return `{${props.join(' ')}}`;
        };
        let filter = (k) => {
            if (showAllEnv) {
                return true;
            }
            return this[k] && this.env[k].constructor !== ImageData;
        };
        let list = Object.getOwnPropertyNames(this.env)
            .sort()
            .filter(filter)
            .map((k)=>`${k}: ${print(this.env[k])}`);
        if (envList) {
            envList.innerHTML = `<pre>${list.join('\n')}</pre>`;
        }
    };

    Shadama.prototype.populateList = function(newList) {
        if (!domTools) {return;}
        watcherElements = [];
        for (let i = 0; i < newList.length; i++) {
            let name = newList[i];
            let entry = this.detectEntry(name);
            if (!entry) {
                entry = this.makeEntry(name);
            }
            watcherElements.push(entry);
        }
        this.removeAll();
        this.addAll(watcherElements);
    };

    Shadama.prototype.addEnv = function(key, asset) {
        this.env[key] = asset;
    };

    Shadama.prototype.runLoop = function() {
        if (this.statics["loop"]) {
            this.startScript("loop");
        }
    };

    Shadama.prototype.once = function(name) {
        if (this.statics[name]) {
            try {
                this.statics[name](this.env);
            } catch(e) {
                this.reportError(e);
            }
        }
    };

    Shadama.prototype.setEditor = function(anEditor, type) {
        editor = anEditor;
        editorType = type;
    };

    Shadama.prototype.emptyImageData = function(width, height) {
        let ary = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            ary[i * 4 + 0] = i;
            ary[i * 4 + 1] = 0;
            ary[i * 4 + 2] = 0;
            ary[i * 4 + 3] = 255;
        }
        return new ImageData(ary, 256, 256);
    };

    Shadama.prototype.cleanUpEditorState = function() {
        if (editor) {
            if (editorType === "CodeMirror") {
                if (parseErrorWidget) {
                    editor.removeLineWidget(parseErrorWidget);
                    parseErrorWidget = null;
                }
                editor.getAllMarks().forEach((mark) => mark.clear());
            }
            if (editorType === "Carota") {
                if (parseErrorWidget) {
                    parseErrorWidget.visible(false);
                }
            }
        }
    };

    Shadama.prototype.reportError = function(error) {
        let toDOM = (x) => {
            if (x instanceof Array) {
                let xNode = document.createElement(x[0]);
                x.slice(1)
                    .map(toDOM)
                    .forEach(yNode => xNode.appendChild(yNode));
                return xNode;
            }
            return document.createTextNode(x);
        };

        if (editor) {
            if (editorType === "CodeMirror") {
                if (error.message !== "runtime error") {
                    setTimeout(
                        function() {
                            let msg = error.expected;
                            let pos = error.pos;
                            let src = error.src;
                            if ((!src || editor.getValue() === src) && !parseErrorWidget) {
                                function repeat(x, n) {
                                    let xs = [];
                                    while (n-- > 0) {
                                        xs.push(x);
                                    }
                                    return xs.join('');
                                }
                                let docPos = editor.doc.posFromIndex(pos);
                                let widget = toDOM(['parseerror', repeat(' ', docPos.ch) + '^\n' + msg]);
                                if (pos && msg) {
                                    console.log(pos, msg);
                                } else {
                                    console.log(error);
                                }
                                parseErrorWidget = editor.addLineWidget(docPos.line, widget);
                            }
                        },
                        1500);
                } else {
                    for (let n in this.steppers) {
                        this.stopScript(n);
                    }
                    alert(error.expected);
                }
            }
        } else {
            let msg = error.expected;
            let pos = error.pos;
            if (pos && msg) {
                console.log(pos, msg);
            } else {
                console.log(error);
            }
        }
    };

    Shadama.prototype.setVariable = function(varName, value) {
        this.env[varName] = value;
    };

    Shadama.prototype.step = function() {
        this.env["time"] = (window.performance.now() / 1000) - this.loadTime;
        for (let k in this.triggers) {
            this.triggers[k].maybeFire(this);
        }
        try {
            for (let k in this.steppers) {
                let func = this.statics[k];
                if (func) {
                    func(this.env);
                }
            }
        } catch(e) {
            this.reportError(e);
        }
    };

    Shadama.prototype.maybeRunner = function(optFunc) {
        if (!animationRequested) {
            this.runner(optFunc);
        }
    };

    Shadama.prototype.runner = function(optFunc) {
        let that = this;

        let runBody = () => {
            if (domTools) {
                animationRequested = false;
                let start = performance.now();
                that.step();
                let now = performance.now();
                times.push({start, step: now - start});

                if ((times.length > 0 && now - times[0].start > 1000) || times.length === 2) {
                    while (times.length > 1 && now - times[0].start > 500) {
                        times.shift();
                    }

                    let frameTime = (times[times.length-1].start - times[0].start) / (times.length - 1);
                    //let stepTime = times.reduce((a, b) => ({step: a.step + b.step})).step / times.length;
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
    };

    Shadama.prototype.destroy = function() {
        if (editorType === "Carota") {
            if (parseErrorWidget) {
                parseErrorWidget.removeSelf();
            }
        }
        //
    };

    Shadama.prototype.pause = function() {
        this.steppers = {};
    };

    Shadama.prototype.pointermove = function(x, y) {
        this.env.mousemove = {x, y};
    };

    Shadama.prototype.pointerup = function(x, y) {
        this.env.mouseup = {x, y};
    };

    Shadama.prototype.pointerdown = function(x, y) {
        this.env.mousedown = {x, y};
    };

    Shadama.prototype.tester = function() {
        return {
            parse,
            update,
            translate,
            s,
            Breed,
            Patch,
            SymTable,
        };
    };

    Shadama.prototype.goFullScreen = function() {
        let req = shadamaCanvas.requestFullscreen || shadamaCanvas.webkitRequestFullscreen
            || shadamaCanvas.mozRequestFullScreen || shadamaCanvas.msRequestFullscreen;

        if (req) {
            req.call(shadamaCanvas);

            let fsChanged = () => {
                if (document.fullscreenElement
                    || document.webkitFullscreenElement
                    || document.mozFullScreenElement
                    || document.msFullscreenElement) {
                    let rx = window.innerWidth / FW;
                    let ry = window.innerHeight / FH;
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
    };

    Shadama.prototype.resizeClimateFullScreen = function() {
        let box = {width: window.innerWidth, height: window.innerHeight};
        let scale = Math.min(box.width / 1024, box.height / 768);
        shadamaCanvas.style.setProperty("transform", `scale(${scale})`);
        shadamaCanvas.style.setProperty("transform-origin", `0 0`);
    };

    Shadama.prototype.setClimateFullScreen = function(optFlag) {
        let flag = optFlag;
        if (flag === undefined) {
            flag = !this.climateFullScreen;
        }

        if (flag === this.climateFullScreen) {return;}
        this.climateFullScreen = flag;

        let elems = ["bigTitle", "controlBox", "readout", "fullScreenButton"];
        let canvasHolder = document.getElementById("canvasHolder");

        shadamaCanvas = document.getElementById("shadamaCanvas");
        if (flag) {
            elems.forEach(n => {
                document.getElementById(n).style.setProperty("display", "none");
            });
            canvasHolder.style.setProperty("float", "none");
            canvasHolder.style.setProperty("width", "100%");
            canvasHolder.style.setProperty("height", "100%");
            // shadamaCanvas.style.setProperty("border", "0px");
            shadamaCanvas.style.setProperty("margin-right", "0px");

            window.onresize = () => this.resizeClimateFullScreen();

            this.resizeClimateFullScreen();
            let code = document.body.querySelector(".CodeMirror");
            if (code) {
                code.style.setProperty("display", "none");
            }
            document.body.style.setProperty("margin", "0px");
        } else {
            elems.forEach(n => {
                document.getElementById(n).style.removeProperty("display");
            });
            canvasHolder.style.removeProperty("float");
            canvasHolder.style.removeProperty("width");
            canvasHolder.style.removeProperty("height");
            // shadamaCanvas.style.removeProperty("border");
            shadamaCanvas.style.removeProperty("margin-right");
            let code = document.body.querySelector(".CodeMirror");
            if (code) {
                code.style.removeProperty("display");
            }
            document.body.style.removeProperty("margin");
            delete window.onresize;
        }
        if (croquetView) {
            croquetView.updateFullScreen(this.climateFullScreen);
        }
    };

    class Display {
        constructor(shadama) {
            this.shadama = shadama;
            if (withThreeJS) {
                this.clearColor = new THREE.Color(0xFFFFFFFF);
                this.otherColor = new THREE.Color(0x00000000);
            } else {
                this.clearColor = [1, 1, 1, 1];
            }
        }

        clear() {
            let t = webglTexture();
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
                gl.clearColor(...this.clearColor);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }

            if (!t) {
                setTargetBuffer(null, null);
            }
        }

        setClearColor(r, g, b, a) {
            this.clearColor = [r, g, b, a];
        }

        playSound(buffer) {
            if (!buffer) {return;}
            if (buffer.constructor === ShadamaEvent) {
                buffer = buffer.value;
            }
            let source = audioContext.createBufferSource(); // creates a sound source
            source.buffer = buffer;                    // tell the source which sound to play
            source.connect(audioContext.destination);       // connect the source to the context's destination (the speakers)
            source.start(0);                           // play the source now
        }

        loadProgram(name, func) {
            let location = window.location.toString();
            if (!location.startsWith("http")) {return;}
            let slash = location.lastIndexOf("/");
            let dir = `${location.slice(0, slash)}/examples`;

            let file = dir + "/" + encodeURIComponent(name);

            let shadama = this.shadama;
            let xhttp = new XMLHttpRequest();
            xhttp.onreadystatechange = () => {
                if (xhttp.readyState === 4 && xhttp.status === 200) {
                    let serverCode = xhttp.responseText;
                    if (func) {
                        func(serverCode);
                    } else {
                        shadama.loadShadama(null, serverCode);
                        if (editor) {
                            editor.doc.setValue(serverCode);
                        }
                        shadama.maybeRunner();
                    }
                }
            };
            xhttp.open("GET", file, true);
            xhttp.send();
        }

        croquetPublish(name, v1, v2) {
            if (croquetView) {
                croquetView.publishMessage(name, v1, v2);
            }
        }

        debugger() {
            debugger;
        }
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
            this.pointSize = 1;
        }

        fillRandom(name, min, max) {
            let ary = new Float32Array(T * T);
            let range = max - min;
            for (let i = 0; i < ary.length; i++) {
                ary[i] = Math.random() * range + min;
            }
            updateOwnVariable(this, name, ary);
        }

        fillRandomDir(xName, yName) {
            let x = new Float32Array(T * T);
            let y = new Float32Array(T * T);
            for (let i = 0; i < x.length; i++) {
                let dir = Math.random() * Math.PI * 2.0;
                x[i] = Math.cos(dir);
                y[i] = Math.sin(dir);
            }
            updateOwnVariable(this, xName, x);
            updateOwnVariable(this, yName, y);
        }

        fillRandomDir3(xName, yName, zName) {
            let x = new Float32Array(T * T);
            let y = new Float32Array(T * T);
            let z = new Float32Array(T * T);
            for (let i = 0; i < x.length; i++) {
                let angleY = Math.random() * Math.PI * 2.0;
                let angleX = Math.asin(Math.random() * 2.0 - 1.0);
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
            let x = new Float32Array(T * T);
            let y = new Float32Array(T * T);

            for (let j = 0; j < yDim; j++) {
                for (let i = 0; i < xDim; i++) {
                    let ind = xDim * j + i;
                    x[ind] = i;
                    y[ind] = j;
                }
            }
            updateOwnVariable(this, xName, x);
            updateOwnVariable(this, yName, y);
        }

        fillCuboid(xName, yName, zName, xDim, yDim, zDim, step) {
            this.setCount(xDim * yDim);
            let x = new Float32Array(T * T);
            let y = new Float32Array(T * T);
            let z = new Float32Array(T * T);

            let ind = 0;

            for (let l = 0; l < zDim; l += step) {
                for (let j = 0; j < yDim; j += step) {
                    for (let i = 0; i < xDim; i += step) {
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
            let x = new Float32Array(T * T);

            for (let j = 0; j < this.count; j++) {
                x[j] = value;
            }
            updateOwnVariable(this, name, x);
        }

        fillImage(xName, yName, rName, gName, bName, aName, imagedata) {
            if (imagedata === undefined) {
                let error = new Error("runtime error");
                error.reason = `imagedata is not available`;
                error.expected = `imagedata is not available`;
                error.pos = -1;
                error.src = null;
                throw error;
            }
            if (imagedata.constructor === ShadamaEvent) {
                imagedata = imagedata.value;
            }
            let xDim = imagedata.width;
            let yDim = imagedata.height;
            this.fillSpace(xName, yName, xDim, yDim);

            let r = new Float32Array(T * T);
            let g = new Float32Array(T * T);
            let b = new Float32Array(T * T);
            let a = new Float32Array(T * T);

            for (let j = 0; j < yDim; j++) {
                for (let i = 0; i < xDim; i++) {
                    let src = j * xDim + i;
                    let dst = (yDim - 1 - j) * xDim + i;
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

        setPointSize(size) {
            this.pointSize = size;
        }

        loadData(data) {
            // assumes that the first line is the schema of the table
            if (data.constructor === ShadamaEvent) {
                data = data.value;
            }
            let schema = data[0];

            for (let k in this.own) {
                let ind = schema.indexOf(k);
                if (ind >= 0) {
                    let ary = new Float32Array(T * T);
                    for (let i = 1; i < data.length; i++) {
                        ary[i - 1] = data[i][ind];
                    }
                    updateOwnVariable(this, k, ary);
                }
                this.setCount(data.length - 1);
            }
        }

        loadVideoFrame(video) {
            if (video.constructor === ShadamaEvent) {
                video = video.value;
            }

            if (!video.checkReady()) {return;}

            let vTex = video.texture; // rgba

            let updateTexture = video.updateTexture;
            updateTexture(gl, vTex, video.video);

            let prog = programs["copyRGBA"];
            let that = this;

            let cs = ["r", "g", "b", "a"];

            let targets = cs.map((n) => this[N + n]);

            framebufferBreed = makeFramebuffer(gl.R32F, T, T);
            setTargetBuffers(framebufferBreed, targets);

            state.useProgram(prog.program);
            gl.bindVertexArray(prog.vao);
            noBlend();

            state.activeTexture(gl.TEXTURE1);
            state.bindTexture(gl.TEXTURE_2D, vTex);
            gl.uniform1i(prog.uniLocations["u_videoTexture"], 1);

            if (!withThreeJS) {
                gl.viewport(0, 0, T, T);
            }
            gl.uniform2f(prog.uniLocations["u_resolution"], T, T);
            gl.uniform2f(prog.uniLocations["u_half"], 0.5/T, 0.5/T);
            gl.uniform2i(prog.uniLocations["u_videoExtent"], video.video.videoWidth, video.video.videoHeight);

            this.count = video.video.videoWidth * video.video.videoHeight;

            gl.drawArrays(gl.POINTS, 0, this.count);
            gl.flush();

            noBlend();
            gl.deleteFramebuffer(framebufferBreed);
            framebufferBreed = null;

            setTargetBuffer(null, null);
            for (let i = 0; i < cs.length; i++) {
                let name = cs[i];
                let tmp = that[name];
                this[name] = this[N + name];
                this[N + name] = tmp;
            }
            gl.bindVertexArray(null);
        }

        draw() {
            let prog = programs["drawBreed"];
            let t = webglTexture();

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

            if (!withThreeJS) {
                gl.viewport(0, 0, FW, FH);
            }
            gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
            gl.uniform2f(prog.uniLocations["u_half"], 0.5/FW, 0.5/FH);
            gl.uniform1f(prog.uniLocations["u_pointSize"], this.pointSize);

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
            let prog = programs["renderBreed"];
            let breed = this;
            let uniLocations = prog.uniLocations;

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

            let maybeD = breed["d"];
            if (maybeD !== undefined) {
                if (typeof maybeD === "number") {
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
            let prog = programs["increasePatch"];

            let src = patch[name];
            let dst = patch[N + name];
            textureCopy(patch, src, dst);
            setTargetBuffer(framebufferDiffuse, dst);

            let uniLocations = prog.uniLocations;

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
            let prog = programs["increaseVoxel"];

            let src = patch[name];
            let dst = patch[N + name];
            textureCopy(patch, src, dst);
            setTargetBuffer(framebufferDiffuse, dst);

            let uniLocations = prog.uniLocations;

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
            let val = shadama.readValues(this, n, x, y, w, h);
            return new ShadamaEvent().setValue(val);
        }

        setCount(n) {
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
            let prog = programs["drawPatch"];
            let t = webglTexture();

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
            let prog = programs["renderPatch"];
            let t = webglTexture();

            if (t) {
                setTargetBuffer(framebufferU8RGBA, t);
            } else {
                setTargetBuffer(null, null);
            }

            let uniLocations = prog.uniLocations;

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
            let prog = programs["diffusePatch"];
            let src = this[name];
            let dst = this[N + name];

            setTargetBuffer(framebufferDiffuse, dst);

            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                console.log("incomplete framebuffer");
            }

            let uniLocations = prog.uniLocations;

            state.useProgram(prog.program);
            gl.bindVertexArray(prog.vao);

            noBlend();

            state.activeTexture(gl.TEXTURE0);
            state.bindTexture(gl.TEXTURE_2D, src);
            gl.uniform1i(uniLocations["u_value"], 0);

            if (!withThreeJS) {
                gl.viewport(0, 0, FW, FH);
            }

            gl.uniform2f(uniLocations["u_half"], 0.5/FW, 0.5/FH);

            gl.drawArrays(gl.POINTS, 0, FW * FH);
            gl.flush();

            setTargetBuffer(null, null);
            gl.bindVertexArray(null);

            this[name] = dst;
            this[N + name] = src;
        }

        readValues(n, x, y, w, h) {
            let val = shadama.readValues(this, n, x, y, w, h);
            return new ShadamaEvent().setValue(val);
        }
    }

    let shadamaGrammar = String.raw`
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
    | IfStatement
    | ExpressionStatement
    | ReturnStatement

  VariableStatement = var VariableDeclaration ";"?
  VariableDeclaration = ident Initialiser?
  Initialiser = "=" Expression

  ReturnStatement = return Expression ";"?

  ExpressionStatement = Expression ";"?
  IfStatement = if "(" Expression ")" Statement (else Statement)?

  AssignmentStatement
    = LeftHandSideExpression "=" Expression ";"?

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

    let g;
    let s;

    let globalTable; // This is a bad idea but then I don't know how to keep the reference to global.

    let primitives;

    function initPrimitiveTable() {
        let data = {
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
            "loadVideoFrame": new SymTable([
                ["param", null, "video"]], true),
            "diffuse": new SymTable([
                ["param", null, "name"]], true),
            "setPointSize": new SymTable([
                ["param", null, "size"]], true),
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
            "setClearColor": new SymTable([
                ["param", null, "r"],
                ["param", null, "g"],
                ["param", null, "b"],
                ["param", null, "a"]], true),
            "readValues": new SymTable([
                ["param", null, "name"],
                ["param", null, "x"],
                ["param", null, "y"],
                ["param", null, "w"],
                ["param", null, "h"]], true),
            "croquetPublish": new SymTable([
                ["param", null, "name"],
                ["param", null, "v1"],
                ["param", null, "v2"]], true),
            "debugger": new SymTable([], true),
            "start": new SymTable([], true),
            "step": new SymTable([], true),
            "stop": new SymTable([], true),
        };

        primitives = {};
        for (let k in data) {
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
            for (let k in primitives) {
                obj[k] = primitives[k];
            }

            obj["mousedown"] = {x:0, y:0};
            obj["mousemove"] = {x:0, y:0};
            obj["mouseup"] = {x:0, y:0};

        }

        function processHelper(symDict) {
            let queue;   // = [name]
            let result;  // = {<name>: <name>}
            function traverse() {
                let head = queue.shift();
                if (!result[head]) {
                    result.add(head, head);
                    let d = symDict[head];
                    if (d && d.type === "helper") {
                        d.usedHelpersAndPrimitives.keysAndValuesDo((h, _v) => {
                            queue.push(h);
                        });
                    }
                }
            }

            for (let k in symDict) {
                let dict = symDict[k];
                if (dict.type === "method") {
                    queue = [];
                    result = new OrderedPair();
                    dict.usedHelpersAndPrimitives.keysAndValuesDo((i, _v) => {
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
                    let result = {};
                    addDefaults(result);
                    if (p.children.length > 0) {
                        result = addAsSet(result, p.children[0].symTable(null));
                    }
                    for (let i = 0; i< ds.children.length; i++) {
                        let d = ds.children[i].symTable(null);
                        let ctor = ds.children[i].ctorName;
                        if (ctor === "Script" || ctor === "Static" || ctor === "Helper") {
                            addAsSet(result, d);
                        }
                        if (ctor === "On" || ctor === "Event" || ctor === "Data") {
                            addAsSet(result, d);
                        }
                    }
                    processHelper(result);
                    globalTable = result;
                    return result;
                },

                ProgramDecl(_p, name) {
                    return {_programName: name.sourceString.slice(1, name.sourceString.length - 1)};
                },

                Breed(_b, n, _o, fs, _c) {
                    let table = new SymTable();
                    fs.symTable(table);
                    table.process();
                    return {[n.sourceString]: table};
                },

                Patch(_p, n, _o, fs, _c) {
                    let table = new SymTable();
                    fs.symTable(table);
                    table.process();
                    return {[n.sourceString]: table};
                },

                Event(_e, n) {
                    let table = new SymTable();
                    table.beEvent(n.sourceString);
                    return {[n.sourceString]: table};
                },

                On(_o, t, _a, optK, n) {
                    let table = new SymTable();
                    let trigger = t.trigger();
                    let k;
                    if (optK.children.length > 0) {
                        k = optK.children[0].sourceString;
                    } else {
                        k = "step";
                    }
                    table.beTrigger(trigger, [k, n.sourceString]);
                    return {["_trigger" + trigger.toString()]: table};
                },

                Data(_d, n, _o, s1, _a, s2, _c) {
                    let table = new SymTable();
                    let realS1 = s1.children[1].sourceString;
                    let realS2 = s2.children[1].sourceString;
                    table.beData(n.sourceString, realS1, realS2);
                    return {[n.sourceString]: table};
                },

                Script(_d, n, _o, ns, _c, b) {
                    let table = new SymTable();
                    ns.symTable(table);
                    b.symTable(table);
                    table.process();
                    return {[n.sourceString]: table};
                },

                Helper(_d, n, _o, ns, _c, b) {
                    let table = new SymTable();
                    ns.symTable(table);
                    b.symTable(table);
                    table.beHelper();
                    return {[n.sourceString]: table};
                },

                Static(_s, n, _o, ns, _c, _b) {
                    let table = new SymTable();
                    ns.symTable(table);
                    table.process();
                    table.beStatic();
                    return {[n.sourceString]: table};
                },

                Formals_list(h, _c, r) {
                    let table = this.args.table;
                    table.add("param", null, h.sourceString);
                    for (let i = 0; i < r.children.length; i++) {
                        let n = r.children[i].sourceString;
                        table.add("param", null, n);
                    }
                    return table;
                },

                StatementList(ss) { // an iter node
                    let table = this.args.table;
                    for (let i = 0; i< ss.children.length; i++) {
                        ss.children[i].symTable(table);
                    }
                    return table;
                },

                VariableDeclaration(n, optI) {
                    let table = this.args.table;
                    table.add("var", null, n.sourceString);
                    if (optI.children.length > 0) {
                        optI.children[0].symTable(table);
                    }
                    return table;
                },

                IfStatement(_if, _o, c, _c, t, _e, optF) {
                    let table = this.args.table;
                    c.symTable(table);
                    t.symTable(table);
                    if (optF.children.length > 0) {
                        optF.children[0].symTable(table);
                    }
                    return table;
                },

                LeftHandSideExpression_field(n, _a, f) {
                    let name = n.sourceString;
                    let table = this.args.table;
                    if (!table.hasVariable(name)) {
                        let error = new Error("syntax error");
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
                    let table = this.args.table;
                    if (!(n.ctorName === "PrimExpression" && (n.children[0].ctorName === "PrimExpression_variable"))) {
                        console.log("you can only use 'this' or incoming patch name");
                    }
                    let name = n.sourceString;
                    if (!table.isBuiltin(name)) {
                        table.add("propIn", n.sourceString, f.sourceString);
                    }
                    if (!table.hasVariable(name)) {
                        let error = new Error("syntax error");
                        error.reason = `variable ${name} is not declared`;
                        error.expected = `variable ${name} is not declared`;
                        error.pos = n.source.endIdx;
                        error.src = null;
                        throw error;
                    }
                    return table;
                },

                PrimExpression_variable(_n) {
                    return {};//["var." + n.sourceString]: ["var", null, n.sourceString]};
                },

                PrimitiveCall(n, _o, as, _c) {
                    this.args.table.maybeHelperOrPrimitive(n.sourceString);
                    return as.symTable(this.args.table);
                },

                Actuals_list(h, _c, r) {
                    let table = this.args.table;
                    h.symTable(table);
                    for (let i = 0; i < r.children.length; i++) {
                        r.children[i].symTable(table);
                    }
                    return table;
                },

                ident(_h, _r) {return this.args.table;},
                number(_s) {return this.args.table;},
                _terminal() {return this.args.table;},
                _nonterminal(children) {
                    let table = this.args.table;
                    for (let i = 0; i < children.length; i++) {
                        children[i].symTable(table);
                    }
                    return table;
                },
            });

        function transBinOp(l, r, op, args) {
            let table = args.table;
            let vert = args.vert;
            let frag = args.frag;
            vert.push("(");
            l.glsl(table, vert, frag);
            vert.push(op);
            r.glsl(table, vert, frag);
            vert.push(")");
        }

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
                    let table = this.args.table;
                    let vert = this.args.vert;

                    vert.push("float " + n.sourceString);
                    vert.push("(");
                    ns.glsl_helper(table, vert);
                    vert.push(")");
                    b.glsl_helper(table, vert);

                    vert.crIfNeeded();
                    let code = vert.contents();
                    table.helperCode = code;

                    return {[n.sourceString]: [table, code, "", ["updateHelper", n.sourceString]]};
                },

                Formals_list(h, _c, r) {
                    let vert = this.args.vert;

                    vert.push("float " + h.sourceString);
                    for (let i = 0; i < r.children.length; i++) {
                        let c = r.children[i];
                        vert.push(", float ");
                        vert.push(c.sourceString);
                    }
                },

                Block(_o, ss, _c) {
                    let table = this.args.table;
                    let vert = this.args.vert;

                    vert.pushWithSpace("{\n");
                    vert.addTab();

                    ss.glsl_helper(table, vert);

                    vert.decTab();
                    vert.tab();
                    vert.push("}");
                },

                StatementList(ss) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    for (let i = 0; i < ss.children.length; i++) {
                        vert.tab();
                        ss.children[i].glsl_helper(table, vert);
                    }
                },

                Statement(e) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    e.glsl_helper(table, vert);
                    if (e.ctorName !== "Block" && e.ctorName !== "IfStatement") {
                        vert.push(";");
                        vert.cr();
                    }
                    if (e.ctorName === "IfStatement") {
                        vert.cr();
                    }
                },

                IfStatement(_i, _o, c, _c, t, _e, optF) {
                    let table = this.args.table;
                    let vert = this.args.vert;
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
                    let table = this.args.table;
                    let vert = this.args.vert;

                    vert.pushWithSpace("return");
                    vert.push(" ");
                    e.glsl_helper(table, vert);
                },

                AssignmentStatement(l, _a, e, _) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    l.glsl_helper(table, vert);
                    vert.push(" = ");
                    e.glsl_helper(table, vert);
                },

                VariableStatement(_v, d, _s) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    d.glsl_helper(table, vert);
                },

                VariableDeclaration(n, i) {
                    let table = this.args.table;
                    let vert = this.args.vert;
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

                LeftHandSideExpression_field(n, _p, _f) {
                    let vert = this.args.vert;
                    vert.push(n.sourceString);
                },

                ExpressionStatement(e ,_s) {
                    let table = this.args.table;
                    let vert = this.args.vert;
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
                    let table = this.args.table;
                    let vert = this.args.vert;
                    vert.pushWithSpace("-");
                    e.glsl_helper(table, vert);
                },

                UnaryExpression_not(_p, e) {
                    let table = this.args.table;
                    let vert = this.args.vert;
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
                    let vert = this.args.vert;
                    let ind = e.sourceString.indexOf(".");
                    if (ind < 0) {
                        vert.push(e.sourceString + ".0");
                    } else {
                        vert.push(e.sourceString);
                    }
                },

                PrimExpression_field(n, _p, f) {
                    let table = this.args.table;
                    let vert = this.args.vert;

                    if (table.isObject(n.sourceString)) {
                        vert.push(n.sourceString + "." + f.sourceString);
                    } else {
                        throw new Error("error");
                    }
                },

                PrimExpression_variable(n) {
                    this.args.vert.push(n.sourceString);
                },

                PrimitiveCall(n, _o, as, _c) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    vert.push(n.sourceString);
                    vert.push("(");
                    as.glsl_helper(table, vert);
                    vert.push(")");
                },

                Actuals_list(h, _c, r) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    h.glsl_helper(table, vert);
                    for (let i = 0; i < r.children.length; i++) {
                        vert.push(", ");
                        r.children[i].glsl_helper(table, vert);
                    }
                },

                ident(_n, _rest) {
                    // ??
                    this.args.vert.push(this.sourceString);
                },
            });

        s.addOperation(
            "glsl_inner(table, vert, frag)",
            {
                Block(_o, ss, _c) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;

                    let patchInput = `
  float _x = texelFetch(u_that_x, ivec2(a_index), 0).r;
  float _y = texelFetch(u_that_y, ivec2(a_index), 0).r;
  vec2 _pos = vec2(_x, _y);
`;

                    let voxelInput = `
  float _x = texelFetch(u_that_x, ivec2(a_index), 0).r;
  float _y = texelFetch(u_that_y, ivec2(a_index), 0).r;
  float _z = texelFetch(u_that_z, ivec2(a_index), 0).r;
  _x = floor(_x / v_step); // 8   //  [0..64), if originally within [0..512)
  _y = floor(_y / v_step); // 8
  _z = floor(_z / v_step); // 8

  int index = int(_z * v_resolution.x * v_resolution.y + _y * v_resolution.x + _x);
  vec2 _pos = vec2(index % int(u_resolution.x), index / int(u_resolution.x));
`;

                    let patchPrologue = `
  vec2 oneToOne = ((_pos / u_resolution) + u_half) * 2.0 - 1.0;
`;

                    let breedPrologue = `
  vec2 oneToOne = (b_index + u_half) * 2.0 - 1.0;
`;

                    let voxelPrologue = `
  vec2 oneToOne = ((_pos / u_resolution.xy) + u_half) * 2.0 - 1.0;
`;

                    let epilogue = `
  gl_Position = vec4(oneToOne, 0.0, 1.0);
  gl_PointSize = 1.0;
`;

                    vert.pushWithSpace("{\n");
                    vert.addTab();

                    if ((table.hasPatchInput || !table.forBreed)) {
                        if (dimension === 2) {
                            vert.push(patchInput);
                        } else {
                            vert.push(voxelInput);
                        }
                    }

                    if (table.forBreed) {
                        vert.push(breedPrologue);
                    } else {
                        if (dimension === 2) {
                            vert.push(patchPrologue);
                        } else {
                            vert.push(voxelPrologue);
                        }
                    }

                    table.scalarParamTable.keysAndValuesDo((key, entry) => {
                        let e = entry[2];
                        let template1 = `float ${e} = u_scalar_${e};`;
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
                    vert
                        .push("}");
                },

                Script(_d, n, _o, ns, _c, b) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;

                    let breedPrologue = `#version 300 es
precision highp float;
layout (location = 0) in vec2 a_index;
layout (location = 1) in vec2 b_index;
uniform vec${dimension} u_resolution;
uniform vec2 u_half;
`;

                    if (dimension === 3) {
                        breedPrologue += `uniform float v_step;
uniform vec3 v_resolution;
`;
                    }

                    let patchPrologue = breedPrologue + `
uniform sampler2D u_that_x;
uniform sampler2D u_that_y;
`;

                    if (dimension === 3) {
                        patchPrologue += `uniform sampler2D u_that_z;
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

                    table.primitivesAndHelpers().forEach((p) => vert.push(p));

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
                    let table = this.args.table;
                    let result = {};
                    for (let i = 0; i < ds.children.length; i++) {
                        let child = ds.children[i];
                        if (child.ctorName === "Static") {
                            let js = new CodeStream();
                            let val = child.static(table, js, null, false);
                            addAsSet(result, val);
                        } else {
                            let val = child.glsl(table, null, null);
                            addAsSet(result, val);
                        }
                    }
                    result["_programName"] = table["_programName"];
                    return result;
                },

                Breed(_b, n, _o, fs, _c) {
                    let table = this.args.table;
                    let js = ["updateBreed", n.sourceString, fs.glsl_script_formals()];
                    return {[n.sourceString]: [table[n.sourceString], "", "", js]};
                },

                Patch(_p, n, _o, fs, _c) {
                    let table = this.args.table;
                    let js = ["updatePatch", n.sourceString, fs.glsl_script_formals()];
                    return {[n.sourceString]: [table[n.sourceString], "", "" ,js]};
                },

                Event(_e, n) {
                    let table = this.args.table;
                    let js = ["event", n.sourceString];
                    return {[n.sourceString]: [table[n.sourceString], "", "", js]};
                },

                On(_o, t, _a, _optK, _k) {
                    let table = this.args.table;
                    let trigger = t.trigger();
                    let key = "_trigger" + trigger.toString();
                    let entry = table[key];
                    let js = ["trigger", entry.trigger, entry.triggerAction];
                    return {[key]: [table[key], "", "", js]};
                },

                Data(_d, i, _o, s1, _a, s2, _c) {
                    let table = this.args.table;
                    let key = i.sourceString;
                    let entry = table[key];
                    let realS1 = s1.children[1].sourceString;
                    let realS2 = s2.children[1].sourceString;
                    let js = ["data", i.sourceString, realS1, realS2];
                    return {[key]: [entry, "", "", js]};
                },

                Script(_d, n, _o, _ns, _c, _b) {
                    let inTable = this.args.table;
                    let table = inTable[n.sourceString];
                    let vert = new CodeStream();
                    let frag = new CodeStream();

                    return this.glsl_inner(table, vert, frag);
                },

                Helper(_d, n, _o, _ns, _c, _b) {
                    let inTable = this.args.table;
                    let table = inTable[n.sourceString];
                    let vert = new CodeStream();

                    return this.glsl_helper(table, vert);
                },

                Block(_o, ss, _c) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;

                    vert.pushWithSpace("{");
                    vert.cr();
                    vert.addTab();
                    ss.glsl(table, vert, frag);
                    vert.decTab();
                    vert.tab();
                    vert.push("}");
                },

                StatementList(ss) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;
                    for (let i = 0; i < ss.children.length; i++) {
                        vert.tab();
                        ss.children[i].glsl(table, vert, frag);
                    }
                },

                Statement(e) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;
                    e.glsl(table, vert, frag);
                    if (e.ctorName !== "Block" && e.ctorName !== "IfStatement") {
                        vert.push(";");
                        vert.cr();
                    }
                    if (e.ctorName === "IfStatement") {
                        vert.cr();
                    }
                },

                IfStatement(_i, _o, c, _c, t, _e, optF) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;
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
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;
                    l.glsl(table, vert, frag);
                    vert.push(" = ");
                    e.glsl(table, vert, frag);
                },

                VariableStatement(_v, d, _s) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;
                    d.glsl(table, vert, frag);
                },

                VariableDeclaration(n, i) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;
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
                    let table = this.args.table;
                    let vert = this.args.vert;
                    vert.push(table.varying(["propOut", n.sourceString, f.sourceString]));
                },

                ExpressionStatement(e ,_s) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;
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
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;
                    vert.pushWithSpace("-");
                    e.glsl(table, vert, frag);
                },

                UnaryExpression_not(_p, e) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;
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
                    let vert = this.args.vert;
                    let ind = e.sourceString.indexOf(".");
                    if (ind < 0) {
                        vert.push(e.sourceString + ".0");
                    } else {
                        vert.push(e.sourceString);
                    }
                },

                PrimExpression_field(n, _p, f) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    //let frag = this.args.frag;

                    if (table.isBuiltin(n.sourceString)) {
                        vert.push(n.sourceString + "." + f.sourceString);
                    } else {
                        if (n.sourceString === "this") {
                            let uni = table.uniform(["propIn", n.sourceString, f.sourceString]);
                            let str = `texelFetch(${uni}, ivec2(a_index), 0).r`;
                            vert.push(str);

                            //vert.push("texelFetch(" +
                            //table.uniform(["propIn", n.sourceString, f.sourceString]) +
                            //`, ivec2(a_index), 0).r`);
                        } else {
                            let uni = table.uniform(["propIn", n.sourceString, f.sourceString]);
                            let str = `texelFetch(${uni}, ivec2(_pos), 0).r`;
                            vert.push(str);

                            //vert.push("texelFetch(" +
                            //table.uniform(["propIn", n.sourceString, f.sourceString]) +
                            //`, ivec2(_pos), 0).r`);
                        }
                    }
                },

                PrimExpression_variable(n) {
                    this.args.vert.push(n.sourceString);
                },

                PrimitiveCall(n, _o, as, _c) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;
                    vert.push(n.sourceString);
                    vert.push("(");
                    as.glsl(table, vert, frag);
                    vert.push(")");
                },

                Actuals_list(h, _c, r) {
                    let table = this.args.table;
                    let vert = this.args.vert;
                    let frag = this.args.frag;
                    h.glsl(table, vert, frag);
                    for (let i = 0; i < r.children.length; i++) {
                        vert.push(", ");
                        r.children[i].glsl(table, vert, frag);
                    }
                },

                ident(_n, _rest) {
                    this.args.vert.push(this.sourceString);
                }
            });

        function staticTransBinOp(l, r, op, args) {
            let table = args.table;
            let js = args.js;
            let method = args.method;
            let isOther = args.isOther;
            js.push("(");
            l.static(table, js, method, isOther);
            js.push(op);
            r.static(table, js, method, isOther);
            js.push(")");
        }

        s.addOperation(
            "static_method_inner(table, js, method, isOther)",
            {
                Actuals_list(h, _c, r) {
                    let table = this.args.table;
                    let result = [];
                    let js = new CodeStream();
                    let method = this.args.method;

                    function isOther(i) {
                        let realTable = table[method];
                        if (!realTable) {return false;}
                        let p = realTable.param.at(i);
                        if (!p) {
                            let error = new Error("semantic error");
                            error.reason = `argument count does not match for method ${method}`;
                            error.expected = `argument count does not match for method ${method}`;
                            error.pos = h.source.endIdx;
                            error.src = null;
                            throw error;
                        }
                        return realTable.usedAsOther(p[2]);
                    }

                    h.static(table, js, method, isOther(0));
                    result.push(js.contents());
                    for (let i = 0; i < r.children.length; i++) {
                        let c = r.children[i];
                        let innerStream = new CodeStream();
                        c.static(table, innerStream, method, isOther(i+1));
                        result.push(innerStream.contents());
                    }
                    return result;
                },

                Formals_list(h, _c, r) {
                    let result = [];

                    result.push(h.sourceString);
                    for (let i = 0; i < r.children.length; i++) {
                        let c = r.children[i];
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
                    let table = this.args.table;
                    let js = this.args.js;
                    let method = this.args.method;

                    js.push("(");
                    js.push("(");
                    js.push(fs.static_method_inner(table, null, null, null));
                    js.push(")");
                    js.push(" => ");
                    b.static(table, js, method, false);
                    js.push(")");

                    /*
                    js.push("(function");
                    js.pushWithSpace(n.sourceString);
                    js.push("(");
                    js.push(fs.static_method_inner(table, null, null, null));
                    js.push(") ");
                    b.static(table, js, method, false);
                    js.push(")");
                    */
                    return {[n.sourceString]: ["static", js.contents(), this.sourceString]};
                },

                Block(_o, ss, _c) {
                    let table = this.args.table;
                    let js = this.args.js;
                    let method = this.args.method;
                    js.pushWithSpace("{");
                    js.cr();
                    js.addTab();
                    ss.static(table, js, method, false);
                    js.decTab();
                    js.tab();
                    js.push("}");
                },

                StatementList(ss) {
                    let table = this.args.table;
                    let js = this.args.js;
                    let method = this.args.method;
                    let isOther = this.args.isOther;
                    for (let i = 0; i < ss.children.length; i++) {
                        js.tab();
                        ss.children[i].static(table, js, method, isOther);
                    }
                },

                Statement(e) {
                    let table = this.args.table;
                    let js = this.args.js;
                    let method = this.args.method;
                    let isOther = this.args.isOther;
                    e.static(table, js, method, isOther);
                    if (e.ctorName !== "Block" && e.ctorName !== "IfStatement") {
                        js.push(";");
                        js.cr();
                    }
                    if (e.ctorName === "IfStatement") {
                        js.cr();
                    }
                },

                IfStatement(_i, _o, c, _c, t, _e, optF) {
                    let table = this.args.table;
                    let js = this.args.js;
                    let method = this.args.method;
                    let isOther = this.args.isOther;
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
                    let table = this.args.table;
                    let js = this.args.js;
                    let method = this.args.method;
                    let isOther = this.args.isOther;
                    d.static(table, js, method, isOther);
                },

                VariableDeclaration(n, i) {
                    let table = this.args.table;
                    let js = this.args.js;
                    let method = this.args.method;
                    let isOther = this.args.isOther;
                    let symTable = new SymTable();
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
                    let table = this.args.table;
                    let js = this.args.js;
                    let method = this.args.method;
                    let isOther = this.args.isOther;
                    let left = table[l.sourceString];
                    if (!left || (!left.isEvent() && !left.isStaticVariable())) {
//                            let error = new Error("semantic error");
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
                    let js = this.args.js;
                    js.pushWithSpace("-");
                    e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
                },

                UnaryExpression_not(_p, e) {
                    let js = this.args.js;
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
                    let js = this.args.js;
                    js.push(e.sourceString);
                },

                PrimExpression_number(e) {
                    let js = this.args.js;
                    js.push(e.sourceString);
                },

                PrimExpression_field(n, _p, f) {
                    let js = this.args.js;
                    n.static(this.args.table, js, this.args.method, this.args.isOther);
                    js.push(".");
                    js.push(f.sourceString);
                },

                PrimExpression_variable(n) {
                    let js = this.args.js;
                    js.push('env["' + n.sourceString + '"]');
                },

                PrimitiveCall(n, _o, as, _c) {
                    let table = this.args.table;
                    let js = this.args.js;
                    let prim = n.sourceString;
                    let math = ["random", // 0 arg
                                "abs", "acos", "acosh", "asin", "asinh", "atan", "atanh",
                                "cbrt", "ceil", "cos", "cosh", "exp", "expm1", "floor",
                                "log", "log1p", "log10", "log2", "round", "sign", "sin",
                                "sinh", "sqrt", "tan", "tanh", "trunc",
                                "floatBitsToUint", // 1 arg
                                "atan2", "max", "min", "pow" // 2 args
                               ];
                    if (math.indexOf(prim) >= 0) {
                        let actuals = as.static_method_inner(table, null, null, false);
                        let str = actuals.join(", ");
                        js.push("Math.");
                        js.push(prim);
                        js.push("(");
                        js.push(str);
                        js.push(")");
                    }
                },

                MethodCall(r, _p, n, _o, as, _c) {
                    let table = this.args.table;
                    let js = this.args.js;
                    let method = n.sourceString;

                    let displayBuiltIns = ["clear", "playSound", "loadProgram", "setClearColor", "croquetPublish", "debugger"];

                    let builtIns = ["draw", "render", "setPointSize", "setCount", "fillRandom", "fillSpace", "fillCuboid", "fillRandomDir", "fillRandomDir3", "fillImage", "loadVideoFrame", "loadData", "readValues", "start", "stop", "step", "diffuse", "increasePatch", "increaseVoxel"];
                    let myTable = table[n.sourceString];

                    let actuals = as.static_method_inner(table, null, method, false);
                    if ((r.sourceString === "Display" && displayBuiltIns.indexOf(method) >= 0) || builtIns.indexOf(method) >= 0) {
                        if (actuals.length !== primitives[method].param.size()) {
                            let error = new Error("semantic error");
                            error.reason = `argument count does not match for primitive ${method}`;
                            error.expected = `argument count does not match for primitive ${method}`;
                            error.pos = as.source.endIdx;
                            error.src = null;
                            throw error;
                        }
                        let str = actuals.join(", ");
                        js.push(`env["${r.sourceString}"].${method}(${str})`);
                        return;
                    }

                    let formals;
                    if (myTable) {
                        formals = myTable.param;
                    }

                    if (formals && (actuals.length !== formals.size())) {
                        let error = new Error("semantic error");
                        error.reason = `argument count does not match for method ${n.sourceString}`;
                        error.expected = `argument count does not match for method ${n.sourceString}`;
                        error.pos = as.source.endIdx;
                        error.src = null;
                        throw error;
                    }
                    let params = new CodeStream();
                    let objectsString = new CodeStream();

                    params.addTab();
                    objectsString.addTab();
                    for (let i = 0; i < actuals.length; i++) {
                        let actual = actuals[i];
                        let isOther;
                        let shortName;
                        if (formals) {
                            let formal = formals.at(i);
                            shortName = formal[2];
                            isOther = myTable.usedAsOther(shortName);
                        } else {
                            shortName = "t" + i;
                            isOther = false;
                        }

                        if (isOther) {
                            objectsString.tab();
                            objectsString.push(`objects["${shortName}"] = ${actual};\n`);
                        } else {
                            params.push(`params["${shortName}"] = ${actual};\n`);
                        }
                    }

                    let callProgram = `
(() => {
    let data = scripts["${n.sourceString}"];
    if (!data) {
        let error = new Error("semantic error");
        error.reason = "Method named ${n.sourceString} does not exist";
        error.expected = "Method named ${n.sourceString} does not exist";
        error.pos = ${_c.source.endIdx};
        error.src = null;
        throw error;
    }
    let func = data[0];
    let ins = data[1][0]; // [[name, <fieldName>]]
    let formals = data[1][1];
    let outs = data[1][2]; //[[object, <fieldName>]]
    let objects = {};
    objects.this = env["${r.sourceString}"];
    ${objectsString.contents()}
    let params = {};
    ${params.contents()}
    func(objects, outs, ins, params);
})()`;
                js.push(callProgram);
            },
        });
    }

    function shouldFire(trigger, env) {
        if (typeof trigger === "string") {
            let evt = env[trigger];
            return evt && evt.ready;
        }

        let key = trigger[0];
        if (key === "and") {
            return shouldFire(trigger[1], env) && shouldFire(trigger[2], env);
        }
        if (key === "and") {
            return shouldFire(trigger[1], env) || shouldFire(trigger[2], env);
        }
        return false;
    }

    function resetTrigger(trigger, env) {
        if (typeof trigger === "string") {
            let evt = env[trigger];
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
            let env = shadama.env;
            if (shouldFire(this.trigger, env)) {
                resetTrigger(this.trigger, env);
                let type = this.triggerAction[0];
                let name = this.triggerAction[1];
                if (type === "start") {
                    shadama.startScript(name);
                } else if (type === "stop") {
                    shadama.stopScript(this.triggerAction[1]);
                } else if (type === "step") {
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
            let maybeEntry = this.entries[k];
            if (maybeEntry) {
                if (maybeEntry[0] === entry[0]
                    && maybeEntry[1] === entry[1]
                     && maybeEntry[2] === entry[2]) {
                    return;
                }
                throw new Error("error duplicate variable: " + k);
            }
            this.entries[k] = entry;
            this.keys.push(k);
        }

        addAll(other) {
            other.keysAndValuesDo((key, entry) => this.add(key, entry));
        }

        at(key) {
            if (typeof key === "number") {
                return this.entries[this.keys[key]];
            }

            return this.entries[key];
        }

        keysAndValuesDo(func) {
            for (let i = 0; i < this.keys.length; i++) {
                func(this.keys[i], this.entries[this.keys[i]]);
            }
        }

        keysAndValuesCollect(func) {
            let result = [];
            this.keysAndValuesDo((key, value) => {
                let element = func(key, value);
                result.push(element);
            });
            return result;
        }

        has(name) {
            let found = null;
            this.keysAndValuesDo((key, value) => {
                if (value[2] === name) {
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
                for (let i = 0; i < entries.length; i++) {
                    this.add.apply(this, (entries[i]));
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
            return this.type === "staticVar";
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
                let newEntry = ["propIn", "this", entry[2]];
                let newK = newEntry.join(".");
                this.thisIn.add(newK, newEntry);
            });
            this.otherOut.keysAndValuesDo((key, entry) => {
                let newEntry = ["propIn", entry[1], entry[2]];
                let newK = newEntry.join(".");
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
                let error = new Error("semantic error");
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
        }

        add(tag, rcvr, name) {
            let entry = [tag, rcvr, name];
            let k = [tag, rcvr || "null", name].join(".");

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

            if ((this.otherOut.size() > 0 || this.otherIn.size() > 0)
                && this.defaultUniforms.indexOf("u_that_x") < 0) {
                this.defaultUniforms = this.defaultUniforms.concat(["u_that_x", "u_that_y"]);
                if (dimension === 3) {
                    if (this.defaultUniforms.indexOf("u_that_z") < 0) {
                        this.defaultUniforms = this.defaultUniforms.concat(["u_that_z", "v_step", "v_resolution"]);
                    }
                }
            }
        }

        usedAsOther(n) {
            let result = false;
            this.otherIn.keysAndValuesDo((k, entry) => {
                result = result || (entry[1] === n);
            });
            this.otherOut.keysAndValuesDo((k, entry) => {
                result = result || (entry[1] === n);
            });
            return result;
        }

        uniform(entry) {
            let k = ["propIn", entry[1], entry[2]].join(".");
            let result = this.uniformTable.at(k);
            if (!result) {
                throw new Error("internal compilation error");
            }
            return ["u", result[1], result[2]].join("_");
        }

        varying(entry) {
            let k = ["propOut", entry[1], entry[2]].join(".");
            let result = this.varyingTable.at(k);
            return ["v", result[1], result[2]].join("_");
        }

        out(entry) {
            let k = ["propOut", entry[1], entry[2]].join(".");
            let result = this.varyingTable.at(k);
            return ["o", result[1], result[2]].join("_");
        }

        uniforms() {
            return this.uniformTable.keysAndValuesCollect((key, entry) => {
                let result = `uniform sampler2D ${this.uniform(entry)};`;
                return result;
            });
        }

        paramUniforms() {
            let result = [];
            this.scalarParamTable.keysAndValuesDo((key, entry) => {
                result.push("uniform float u_scalar_" + entry[2] + ";");
            });
            return result;
        }

        vertVaryings() {
            return this.varyingTable.keysAndValuesCollect((key, entry) => {
                let result = `out float ${this.varying(entry)};`;
                return result;
            });
        }

        fragVaryings() {
            return this.varyingTable.keysAndValuesCollect((key, entry) => {
                let result = `in float ${this.varying(entry)};`;
                return result;
            });
        }

        uniformDefaults() {
            return this.varyingTable.keysAndValuesCollect((key, entry) => {
                let u_entry = ["propIn", entry[1], entry[2]];
                let ind = entry[1] === "this" ? `ivec2(a_index)` : `ivec2(_pos)`;
                return `${this.varying(entry)} = texelFetch(${this.uniform(u_entry)}, ${ind}, 0).r;`;
            });
        }

        outs() {
            let i = 0;
            let result = [];
            this.varyingTable.keysAndValuesDo((key, entry) => {
                result.push("layout (location = " + i + ") out float " + this.out(entry) + ";");
                i++;
            });
            return result;
        }

        fragColors() {
            return this.varyingTable.keysAndValuesCollect((key, entry) => {
                let result = `${this.out(entry)} = ${this.varying(entry)};`;
                return result;
            });
        }

        isBuiltin(n) {
            return this.defaultAttributes.indexOf(n) >= 0 || this.defaultUniforms.indexOf(n) >= 0;
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
            let ins = this.uniformTable.keysAndValuesCollect((key, entry) => [entry[1], entry[2]]);
            let shortParams = this.scalarParamTable.keysAndValuesCollect((key, entry) => entry[2]);
            let outs;
            if (this.forBreed) {
                outs = this.thisOut.keysAndValuesCollect((key, entry) => [entry[1], entry[2]]);
            } else {
                outs = this.otherOut.keysAndValuesCollect((key, entry) => [entry[1], entry[2]]);
            }
            return [ins, shortParams, outs];
        }

        rawTable() {
            let result = {};
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
            return this.allUsedHelpersAndPrimitives.keysAndValuesCollect((n, _v) => {
                if (n === "random") {
                    return `
uint hash(uint x) {
  x += (x << 10u);
  x ^= (x >>  6u);
  x += (x <<  3u);
  x ^= (x >> 11u);
  x += (x << 15u);
  return x;
}

uint hashInt(uint x)
{
  x += x >> 11;
  x ^= x << 7;
  x += x >> 15;
  x ^= x << 5;
  x += x >> 12;
  x ^= x << 9;
  return x;
}


highp float rand(uint h) {
  const uint mantissaMask = 0x007FFFFFu;
  const uint one          = 0x3F800000u;

  h &= mantissaMask;
  h |= one;
    
  float  r2 = uintBitsToFloat(h);
  return r2 - 1.0;
}

highp float random(float f) {
  return rand(hashInt(floatBitsToUint(f)));
}
`;

/*

highp float random(float seed) {
   highp float a  = 12.9898;
   highp float b  = 78.233;
   highp float c  = 43758.5453;
   highp float dt = seed * a + b;
   highp float sn = mod(dt, 3.14159);
   return fract(sin(sn) * c);
}
*/
                }
                if (globalTable[n] && globalTable[n].type === "helper") {
                    return globalTable[n].helperCode;
                }
                return "";
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
            for (let i = 0; i < this.tabLevel; i++) {
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
            let last = val[val.length - 1];
            this.hadSpace = (last === " " || last === "\n" || last === "{" || last === "(");
            this.hadCR = last === "\n";
        }

        pushWithSpace(val) {
            if (!this.hadSpace) {
                this.push(" ");
            }
            this.push(val);
        }

        contents() {
            let flatten = (ary) => {
                let reduced = ary.reduce((a, b) => a.concat(Array.isArray(b) ? flatten(b) : b), []);
                return reduced.join("");
            };
            return flatten(this.result);
        }
    }

    function parse(aString, optRule) {
        let rule = optRule;
        if (!rule) {
            rule = "TopLevel";
        }
        return g.match(aString, rule);
    }

    function addAsSet(to, from) {
        for (let k in from) {
            if (Object.prototype.hasOwnProperty.call(from, k)) {
                to[k] = from[k];
            }
        }
        return to;
    }

    function translate(str, prod, _errorCallback) {
        if (!prod) {
            prod = "TopLevel";
        }
        let match = g.match(str, prod);
        if (!match.succeeded()) {
            console.log(str);
            console.log("did not parse: " + str);
            let error = new Error("parse error");
            error.reason = "parse error";
            error.expected = "Expected: " + match.getExpectedText();
            error.pos = match.getRightmostFailurePosition();
            error.src = str;
            throw error;
        }

        let n = s(match);
        let symTable = n.symTable(null);
        return n.glsl(symTable, null, null);
    }

    let shadama;
    let defaultProgName = optDefaultProgName || "5-Bounce.shadama";

    withThreeJS = !!threeRenderer;
    domTools = !!optDOMTools;

    renderer = threeRenderer;

    if (!renderer) {
        renderer = new StandAloneRenderer();

    }

    runTests = /test.?=/.test(window.location.search);
    showAllEnv = !(/allEnv=/.test(window.location.search));
    degaussdemo = /degaussdemo/.test(window.location.search);
    climatedemo = /climatedemo/.test(window.location.search);
    useCroquet = /useCroquet/.test(window.location.search);

    let bigTitle = document.getElementById("bigTitle");

    if (domTools) {
        if (degaussdemo) {
            FIELD_WIDTH = 1024;
            FIELD_HEIGHT = 768;
            defaultProgName = "14-DeGauss.shadama";
        }
        if (climatedemo) {
            FIELD_WIDTH = 1024;
            FIELD_HEIGHT = 768;
            defaultProgName = "25-2DSystem.shadama";
        }
        let match;
        match = /fw=([0-9]+)/.exec(window.location.search);
        FW = (match && match.length === 2) ? parseInt(match[1], 10) : FIELD_WIDTH;

        match = /fh=([0-9]+)/.exec(window.location.search);
        FH = (match && match.length === 2)  ? parseInt(match[1], 10) : FIELD_HEIGHT;

        match = /t=([0-9]+)/.exec(window.location.search);
        T = (match && match.length === 2) ? parseInt(match[1], 10) : TEXTURE_SIZE;

        if (runTests) {
            setTestParams();
            bigTitle.innerHTML = "Shadama Tests";
        }

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
            //let spector = new SPECTOR.Spector();
            //spector.displayUI();
            gl.getExtension("EXT_color_buffer_float");
            state = gl;
        } else {
            gl = renderer.context;
            if (!renderer.state) {
                throw new Error("a WebGLState has to be passed in");
            }
            state = renderer.state;
            gl.getExtension("EXT_color_buffer_float");
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

        if (degaussdemo) {
            bigTitle.innerHTML = "<button>Full Screen</button>";
            bigTitle.firstChild.onclick = shadama.goFullScreen;
        }

        document.getElementById("fullScreenButton").onclick = () => shadama.goFullScreen();

        if (climatedemo && useCroquet) {
            join().then(session => {
                croquetView = session.view;
                croquetView.setShadama(shadama);
            });
        }

        bigTitle.innerHTML = "Full Screen";
        bigTitle.onclick = () => shadama.setClimateFullScreen();

        if (!editor) {
            let words = (str) => {
                let o = {};
                str.split(" ").forEach((part) => o[part] = true);
                return o;
            };
            CodeMirror.defineMIME("text/shadama", {
                name: "clike",
                keywords: words("program breed patch def static var if else"),
                atoms: words("true false this self width height image mousedown mousemove mouseup time"),
            });

            let cm = CodeMirror.fromTextArea(document.getElementById("code"), {
                mode: "text/shadama",
                matchBrackets: true,
                "extraKeys": {
                    "Cmd-S": (_cm) => shadama.updateCode(),
                    "Alt-S": (_cm) => shadama.updateCode(),
                    "Ctrl-S": (_cm) => shadama.updateCode(),
                },
            });
            cm.on("change", () => {
                if (parseErrorWidget) {
                    shadama.cleanUpEditorState();
                }
            });
            shadama.setEditor(cm, "CodeMirror");
        }

        shadama.initServerFiles();
        shadama.initFileList();

        shadama.initEnv(() => {
            let func = (source) => {
                shadama.loadShadama(null, source);
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
            shadama.env["Display"].loadProgram(defaultProgName, func);
        });
    } else {
        if (!renderer.context
            || renderer.context.constructor !== WebGL2RenderingContext) {
            throw new Error("needs a WebGL2 context");
        }
        gl = renderer.context;
        if (!renderer.state) {
            throw new Error("a WebGLState has to be passed in");
        }
        state = renderer.state;
        gl.getExtension("EXT_color_buffer_float");
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
    programs["copyRGBA"] = copyRGBAProgram();

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
