function ShadamaFactory() {
    var TEXTURE_SIZE = 4;
    var FIELD_WIDTH = 4;
    var FIELD_HEIGHT = 4;

    var T = TEXTURE_SIZE;
    var FW = FIELD_WIDTH;
    var FH = FIELD_HEIGHT;

    // need to change things around here so that you can have different Shadma instances with different sizes

    var breedVAO;
    var programs = {};  // {name: {prog: shader, vao: VAO, uniLocations: uniformLocs}}

    var gl;
    var state;

    var debugCanvas1;
    var debugArray;
    var debugArray1;
    var debugArray2;

    var debugTexture0;
    var framebufferD0;  // for debugging u8rgba texture

    var shadamaCanvas;

    var shaders = {
        "debug.vert":
        `#version 300 es
        precision highp float;
        
        layout (location = 0) in vec2 a_index;
        layout (location = 1) in vec2 b_index;
        uniform sampler2D u_value;

        out vec4 v_color;

        void main(void) {
            vec2 zeroToOne = a_index;
            vec2 clipPos = zeroToOne * 2.0 - 1.0;  // (-1.0-1.0, -1.0-1.0)
            gl_Position = vec4(clipPos, 0, 1.0);
            gl_PointSize = 1.0;

//            ivec2 fc = ivec2(b_index) - ivec2(0, 1);
          ivec2 fc = ivec2(b_index);
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
    }

    function initBreedVAO() {
        var allIndices = new Array(T * T * 2);
        var bIndices = new Array(T * T * 2);
        for (var j = 0; j < T; j++) {
            for (var i = 0; i < T; i++) {
                var ind = ((j * T) + i) * 2;
                allIndices[ind + 0] = i / T;
                allIndices[ind + 1] = j / T;
                bIndices[ind + 0] = i;
                bIndices[ind + 1] = j;
            }
        }

        breedVAO = gl.createVertexArray();
        gl.bindVertexArray(breedVAO);

        var aBuffer = gl.createBuffer();
        var bBuffer = gl.createBuffer();

        var attrLocations = new Array(2);
        attrLocations[0] = 0 // gl.getAttribLocation(prog, 'a_index'); Now a_index has layout location spec
        attrLocations[1] = 1 // gl.getAttribLocation(prog, 'b_index'); Now b_index has layout location spec

        var attrStrides = new Array(2);
        attrStrides[0] = 2;
        attrStrides[1] = 2;

        setBufferAttribute([aBuffer, bBuffer], [allIndices, bIndices], attrLocations, attrStrides);
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

    function debugBreedProgram() {
        return makePrimitive("debug", ["u_value"], breedVAO);
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

        if (type == gl.R32F) {
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
        var tex;
        if (format == gl.FLOAT) {
            tex = createTexture(new Float32Array(width * height * 4), format, width, height);
        }
        var buffer = gl.createFramebuffer();

        gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
        state.bindTexture(gl.TEXTURE_2D, tex);

        if (format == gl.FLOAT) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, format, null);
        }
        state.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        return buffer;
    }

    function setTargetBuffer(buffer, tex) {
        gl.bindFramebuffer( gl.FRAMEBUFFER, buffer );
        if (buffer) {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        }
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

    Shadama.prototype.makeTestObject = function() {
	this.testObj = {};
	var obj = this.testObj;
	
        var ary;
        var width = T;
        var height = T;

	obj.count = FW * FH;

        var ary = new Float32Array(width * height);
        for (var j = 0; j < FH; j++) {
            for (var i = 0; i < FW; i++) {
                var ind = FH * j + i;
                ary[ind] = j;
            }
        }
        obj["test"] = createTexture(ary, gl.R32F, width, height);
    }

    function Shadama() {
        debugTexture0 = createTexture(new Float32Array(T*T*4), gl.FLOAT, T, T);
        framebufferD0 = makeFramebuffer(gl.FLOAT, T, T);
	this.makeTestObject();
    }

    Shadama.prototype.debugDisplay = function() {
        var object = this.testObj;
        var forBreed = true; //object.constructor == Breed;
        var width = forBreed ? T : FW;
        var height = forBreed ? T : FH;
        if (!debugCanvas1) {
            debugCanvas1 = document.getElementById("debugCanvas1");
            if (!debugCanvas1) {
                debugCanvas1 = document.createElement("canvas");
            }
            debugCanvas1.width = width;
            debugCanvas1.height = height;
	    document.body.appendChild(debugCanvas1);
        }

        var prog = programs["debugBreed"];

        setTargetBuffer(framebufferD0, debugTexture0);

        state.useProgram(prog.program);
        gl.bindVertexArray(prog.vao);

        var tex = object["test"];

        gl.viewport(0, 0, width, height);

        state.activeTexture(gl.TEXTURE0);
        state.bindTexture(gl.TEXTURE_2D, tex);

        gl.uniform1i(prog.uniLocations["u_value"], 0);

        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.disable(gl.BLEND);

        gl.drawArrays(gl.POINTS, 0, width * height);
        gl.flush();

        debugArray = new Float32Array(width * height * 4);
        debugArray1 = new Float32Array(width * height);
        debugArray2 = new Uint8ClampedArray(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, debugArray, 0);

        for (var i = 0; i < width * height; i++) {
            debugArray1[i] = debugArray[i * 4 + 0];
        }

        console.log("debugArray1", debugArray1);

        for (var i = 0; i < width * height; i++) {
            debugArray2[i * 4 + 0] = debugArray[i * 4 + 0] // * 255;
            debugArray2[i * 4 + 1] = debugArray[i * 4 + 1] // * 255;
            debugArray2[i * 4 + 2] = debugArray[i * 4 + 2] // * 255;
            debugArray2[i * 4 + 3] = 255;//debugArray[i * 4 + 3] // * 255;
        }

        var img = new ImageData(debugArray2, width, height);
        debugCanvas1.getContext("2d").putImageData(img, 0, 0);
        setTargetBuffer(null, null);

        gl.bindVertexArray(null);
	return debugArray1;
    }

    var shadama;

    if (true) {
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
    }

    initBreedVAO();

    programs["debugBreed"] = debugBreedProgram();

    shadama.gl = gl;
    return shadama;
}
