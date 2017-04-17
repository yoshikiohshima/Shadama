var TEXTURE_SIZE = 512;
var FIELD_WIDTH = 400;
var FIELD_HEIGHT = 300;
var ENLARGE = 2;

var T = TEXTURE_SIZE;
var FW = FIELD_WIDTH;
var FH = FIELD_HEIGHT;

var readout;

var gl;
var VAOExt;
var floatExt;

var breedVAO;
var patchVAO;

var programs = {};

var myBreed;
var myPatch;

var debugCanvas1;

var debugArray;
var debugArray2;

var times = [];

var framebufferT;
var framebufferF;

var debugTexture1;
var debugTexture2;

function initBreedVAO(gl) {
    var allIndices = new Array(T * T * 2);
    for (var j = 0; j < T; j++) {
        for (var i = 0; i < T; i++) {
            var ind = ((j * T) + i) * 2;
            allIndices[ind + 0] = i;
            allIndices[ind + 1] = j;
        }
    }

    breedVAO = gl.createVertexArray();
    gl.bindVertexArray(breedVAO);

    var positionBuffer = gl.createBuffer();

    var attrLocations = new Array(1);
    attrLocations[0] = 0 // gl.getAttribLocation(prog, 'a_index'); Now a_index has layout location spec

    var attrStrides = new Array(1);
    attrStrides[0] = 2;

    set_buffer_attribute(gl, [positionBuffer], [allIndices], attrLocations, attrStrides);
    gl.bindVertexArray(null);
};

function initPatchVAO(gl) {
    patchVAO = gl.createVertexArray();
    gl.bindVertexArray(patchVAO);

    var positionBuffer = gl.createBuffer();
    var rect = [
        -1.0,  1.0,
         1.0,  1.0,
        -1.0, -1.0,
         1.0,  1.0,
         1.0, -1.0,
        -1.0, -1.0,
    ];

    var attrLocations = new Array(1);
    attrLocations[0] = 0; //gl.getAttribLocation(prog, 'a_position'); ; Now a_position has layout location spec

    var attrStrides = new Array(1);
    attrStrides[0] = 2;

    set_buffer_attribute(gl, [positionBuffer], [rect], attrLocations, attrStrides);
    gl.bindVertexArray(null);
};

function createShader(gl, id) {
    var type;
    if (id.endsWith('.vert')) {
        type = gl.VERTEX_SHADER;
    } else if (id.endsWith('.frag')) {
        type = gl.FRAGMENT_SHADER;
    }

    var shader = gl.createShader(type);

    var scriptElement = document.getElementById(id);
    if(!scriptElement){return;}

    var source = scriptElement.text;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }

    console.log(gl.getShaderInfoLog(shader));
    alert(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
};

function createProgram(gl, vertexShader, fragmentShader) {
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
	return program;
    }
    
    console.log(gl.getProgramInfoLog(program));
    alert(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
};

function createTexture(gl, data, format, width, height) {
    if (!format) {
        format = gl.UNSIGNED_BYTE;
    }
    if (!width) {
        width = T;
    }
    if (!height) {
        height = T;
    }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);

    if (format == gl.UNSIGNED_BYTE) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, format, data);
    } else if (format == gl.R32F) {
        gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, gl.RED, gl.FLOAT, data);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, format, data);
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
};

function initFramebuffer(gl, buffer, tex, format, width, height) {
    if (!format) {
        format = gl.UNSIGNED_BYTE;
    }
    if (!width) {
        width = T;
    }
    if (!height) {
        height = T;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    if (format == gl.R32F) {
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, null);
    } else {
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, format, null);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
};

function setTargetBuffer(gl, buffer, tex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
};

function set_buffer_attribute(gl, buffers, data, attrL, attrS) {
    for (var i in buffers) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers[i]);
        gl.bufferData(gl.ARRAY_BUFFER,
              new Float32Array(data[i]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(attrL[i]);
        gl.vertexAttribPointer(attrL[i], attrS[i], gl.FLOAT, false, 0, 0);
    }
};

function createIBO (gl, data) {
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Int32Array(data), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return ibo;
};

function randomDirection() {
    var r = Math.random();
    var r = r * Math.PI * 2.0;
    return [Math.cos(r), Math.sin(r)];
};

function randomPosition() {
    return [Math.random() * FW, Math.random() * FH];
};

function Breed(gl, count) {
    var imageData;

    var a = 0;

    var ary = new Float32Array(T * T * 4);
    for (var j = 0; j < T; j++) {
        for (var i = 0; i < T; i++) {
            var ind = (j * T + i) * 4;
            var p = randomPosition();
            var r = randomDirection();

            ary[ind + 0] = p[0];
            ary[ind + 1] = p[1];
            ary[ind + 2] = r[0];
            ary[ind + 3] = r[1];
        }
    }
    this.pos = createTexture(gl, ary, gl.FLOAT);

    ary = new Float32Array(T * T * 4);
    this.newPos = createTexture(gl, ary, gl.FLOAT);

    ary = new Uint8ClampedArray(T * T * 4);
    for (var j = 0; j < T; j++) {
        for (var i = 0; i < T; i++) {
            var ind = (j * T + i) * 4;
            var c = [0, 0, 255, 50];
            ary[ind + 0] = c[0];
            ary[ind + 1] = c[1];
            ary[ind + 2] = c[2];
            ary[ind + 3] = c[3];
        }
    }

    this.color = createTexture(gl, new ImageData(ary, T, T));
    this.count = count;
};

function Patch(type) {
    if (!type) {type = 'Number'}

    if (type == 'Number') {
        this.values = createTexture(gl, null, gl.FLOAT, FW, FH);
        this.newValues = createTexture(gl, null, gl.FLOAT, FW, FH);
        this.type = 0;
        // need to figure out how to use R32F
    } else if (type == 'Color') {
        this.values = createTexture(gl, new ImageData(FW, FH), gl.UNSIGNED_BYTE, FW, FH);
        this.newValues = createTexture(gl, new ImageData(FW, FH), gl.UNSIGNED_BYTE, FW, FH);
        this.type = 1;
    }
}

function makePrimitive(gl, name, uniforms, vao) {
    var vs = createShader(gl, name + '.vert');
    var fs = createShader(gl, name + '.frag');

    var prog = createProgram(gl, vs, fs);

    var uniLocations = {};
    uniforms.forEach(function (n) {
	uniLocations[n] = gl.getUniformLocation(prog, n);
    });

    return {program: prog, uniLocations: uniLocations, vao: vao};
};

function forwardProgram(gl) {
    return makePrimitive(gl, 'forward', ['u_resolution', 'u_particleLength', 'u_position', 'u_amount'], breedVAO);
};

function forwardEdgeBounceProgram(gl) {
    return makePrimitive(gl, 'forwardEdgeBounce', ['u_resolution', 'u_particleLength', 'u_position', 'u_amount', 'u_edgeCondition'], breedVAO);
};

function setPatchProgram(gl) {
    return makePrimitive(gl, 'setPatch', ['u_resolution', 'u_particleLength', 'u_position', 'u_value', 'u_type'], breedVAO);
};

function getPatchProgram(gl) {
    return makePrimitive(gl, 'getPatch', ['u_resolution', 'u_particleLength', 'u_position', 'u_type'], breedVAO);
};

function turnProgram(gl) {
    return makePrimitive(gl, 'turn', ['u_resolution', 'u_particleLength', 'u_position', 'u_rot'], breedVAO);
};

function bounceIfProgram(gl) {
    return makePrimitive(gl, 'bounceIf', ['u_resolution', 'u_particleLength', 'u_position', 'u_buffer'], breedVAO);
};

function genericGetProgram(gl) {
    return makePrimitive(gl, 'genericGet', ['u_resolution', 'u_particleLength', 'u_v_input'], breedVAO);
};

function genericSetProgram(gl) {
    return makePrimitive(gl, 'genericSet', ['u_resolution', 'u_particleLength', 'u_use_vector', 'u_v_input', 'u_s_input'], breedVAO);
};

function drawBreedProgram(gl) {
    return makePrimitive(gl, 'drawBreed', ['u_resolution', 'u_particleLength', 'u_position', 'u_color'], breedVAO);
};

function drawPatchProgram(gl) {
    return makePrimitive(gl, 'drawPatch', ['u_value', 'u_type'], patchVAO);
};

function debugPatchProgram(gl) {
    return makePrimitive(gl, 'debugPatch', ['u_value'], patchVAO);
};

function debugBreedProgram(gl) {
    return makePrimitive(gl, 'debugBreed', ['u_particleLength', 'u_value'], breedVAO);
};

function diffusePatchProgram(gl) {
    return makePrimitive(gl, 'diffusePatch', ['u_resolution', 'u_value'], patchVAO);
};

function clear() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
};

Breed.prototype.addOwnVariable = function(name, type) {
    ary = new Float32Array(T * T * 4);
    this[name] = createTexture(gl, ary, gl.R32F);
};

Breed.prototype.draw = function() {
    var prog = programs['drawBreed'];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.color);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations['u_position'], 0);
    gl.uniform1i(prog.uniLocations['u_color'], 1);

    gl.drawArrays(gl.POINTS, 0, this.count);

    gl.flush();
    gl.disable(gl.BLEND);
};

Breed.prototype.forward = function(amount) {
    var prog = programs['forward'];
    setTargetBuffer(gl, framebufferT, this.newPos);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.viewport(0, 0, T, T);

    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_position"], 0);
    gl.uniform1f(prog.uniLocations["u_amount"], amount);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var tmp = this.pos;
    this.pos = this.newPos;
    this.newPos = tmp;
};

Breed.prototype.forwardEdgeBounce = function(amount, condition) {
    var prog = programs['forwardEdgeBounce'];
    setTargetBuffer(gl, framebufferT, this.newPos);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.viewport(0, 0, T, T);

    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_position"], 0);
    gl.uniform1f(prog.uniLocations["u_amount"], amount);
    gl.uniform1iv(prog.uniLocations["u_edgeCondition"], new Int32Array(condition));

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var tmp = this.pos;
    this.pos = this.newPos;
    this.newPos = tmp;
};

Breed.prototype.genericGet = function(destination, variable) {
    var prog = programs['genericGet'];
    setTargetBuffer(gl, framebufferR, destination);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, variable);

    gl.viewport(0, 0, T, T);

    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

Breed.prototype.genericSet = function(source, variable) {
    var prog = programs['genericSet'];
    setTargetBuffer(gl, framebufferR, variable);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    var use_vector;

    if (source.constructor == WebGLTexture) {
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, source);
	use_vector = true;
    } else {
	use_vector = false;
    }
    gl.viewport(0, 0, T, T);

    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_use_vector"], use_vector);
    gl.uniform1i(prog.uniLocations["u_v_input"], 0);
    gl.uniform1f(prog.uniLocations["u_s_input"], use_vector ? 0 : value);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

Breed.prototype.turn = function(amount) {
    var prog = programs['turn'];
    setTargetBuffer(gl, framebufferT, this.newPos);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.viewport(0, 0, T, T);

    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_position"], 0);
    var cos = Math.cos(amount);
    var sin = Math.sin(amount);

    gl.uniformMatrix2fv(prog.uniLocations["u_rot"], false, [cos, sin, -sin, cos]);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var tmp = this.pos;
    this.pos = this.newPos;
    this.newPos = tmp;
};

Breed.prototype.bounceIf = function(patch) {
    var prog = programs['bounceIf'];
    setTargetBuffer(gl, framebufferT, this.newPos);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, patch.values);

    gl.viewport(0, 0, T, T);

    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_position"], 0);
    gl.uniform1i(prog.uniLocations["u_buffer"], 1);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var tmp = this.pos;
    this.pos = this.newPos;
    this.newPos = tmp;
};

Breed.prototype.setPatch = function(patch, value) {
    var prog = programs['setPatch'];
    setTargetBuffer(gl, framebufferF, patch.values);
    gl.disable(gl.BLEND);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.viewport(0, 0, FW, FH);

    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_position"], 0);
    gl.uniform4fv(prog.uniLocations["u_value"], value);
    gl.uniform1i(prog.uniLocations["u_type"], patch.type);

    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

Breed.prototype.increasePatch = function(patch, value) {
    var prog = programs['setPatch'];  // the same program but with blend enabled.
    setTargetBuffer(gl, framebufferF, patch.values);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.viewport(0, 0, FW, FH);

    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_position"], 0);
    gl.uniform4fv(prog.uniLocations["u_value"], value);
    gl.uniform1i(prog.uniLocations["u_type"], patch.type);

    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
};

Breed.prototype.getPatch = function(patch, dest) {
    var prog = programs['getPatch'];
    setTargetBuffer(gl, framebufferT, dest);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, patch.values);

    gl.viewport(0, 0, T, T);

    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_position"], 0);
    gl.uniform1i(prog.uniLocations["u_value"], 1);
    gl.uniform1i(prog.uniLocations["u_type"], patch.type);

    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

Breed.prototype.testIfElse = function(condition, t, f) {
    var tex = this.findAvailableTexture();
}
    
Patch.prototype.clear = function() {
    var prog = programs['clearPatch'];
    setTargetBuffer(gl, framebufferF, this.values);

    gl.viewport(0, 0, FW, FH);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
};

Patch.prototype.draw = function() {
    var prog = programs['drawPatch'];

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.values);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.uniform1i(prog.uniLocations['u_value'], 0);
    gl.uniform1i(prog.uniLocations['u_type'], this.type);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

Patch.prototype.diffuse = function() {
    var prog = programs['diffusePatch'];

    setTargetBuffer(gl, framebufferF, this.newValues);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.values);

    gl.viewport(0, 0, FW, FH);

    gl.uniform1i(prog.uniLocations['u_value'], 0);
    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var tmp = this.newValues;
    this.newValues = this.values;
    this.values = tmp;
};

function debugDisplay1(gl, tex) {
    if (!debugCanvas1) {
        debugCanvas1 = document.getElementById('debugCanvas1');
        debugCanvas1.width = FW;
        debugCanvas1.height = FH;
    }
    var prog = programs['debugBreed'];
    setTargetBuffer(gl, framebufferT, debugTexture1);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.viewport(0, 0, T, T);

    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations['u_value'], 0);

    gl.drawArrays(gl.POINTS, 0, myBreed.count);
    gl.flush();

    debugArray = new Float32Array(T * T * 4);
    debugArray2 = new Uint8ClampedArray(T * T * 4);
    gl.readPixels(0, 0, T, T, gl.RGBA, gl.FLOAT, debugArray);

    for (var i = 0; i < T * T; i++) {
	debugArray2[i * 4 + 0] = debugArray[i * 4 + 0];
	debugArray2[i * 4 + 1] = debugArray[i * 4 + 1];
	debugArray2[i * 4 + 2] = debugArray[i * 4 + 2];
	debugArray2[i * 4 + 3] = debugArray[i * 4 + 3];
    }

    var img = new ImageData(debugArray2, T, T);
    debugCanvas1.getContext('2d').putImageData(img, 0, 0);
};

function debugDisplay2(gl, tex) {
    if (!debugCanvas1) {
        debugCanvas1 = document.getElementById('debugCanvas1');
        debugCanvas1.width = FW;
        debugCanvas1.height = FH;
    }
    var prog = programs['debugPatch'];
    setTargetBuffer(gl, framebufferF, debugTexture2);

    gl.useProgram(prog.program);
    gl.bindVertexArray(patchVAO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.uniform1i(prog.uniLocations['u_value'], 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();
    debugArray = new Float32Array(FW * FH * 4);
    debugArray2 = new Uint8ClampedArray(FW * FH * 4);
    gl.readPixels(0, 0, FW, FH, gl.RGBA, gl.FLOAT, debugArray);

    for (var i = 0; i < FW * FH; i++) {
	debugArray2[i * 4 + 0] = debugArray[i * 4 + 0] * 255;
	debugArray2[i * 4 + 1] = debugArray[i * 4 + 1] * 255;
	debugArray2[i * 4 + 2] = debugArray[i * 4 + 2] * 255;
	debugArray2[i * 4 + 3] = debugArray[i * 4 + 3] * 255;
    }

    var img = new ImageData(debugArray2, FW, FH);
    debugCanvas1.getContext('2d').putImageData(img, 0, 0);
};

onload = function() {
    readout = document.getElementById('readout');

    var c = document.getElementById('canvas');
    c.width = FW;
    c.height = FH;
    c.style.width = (FW * ENLARGE) + "px";
    c.style.height = (FH * ENLARGE) + "px";

    gl = c.getContext('webgl2');

    var ext = gl.getExtension('EXT_color_buffer_float');

    initBreedVAO(gl);
    initPatchVAO(gl);

    programs['drawBreed'] = drawBreedProgram(gl);
    programs['forward'] = forwardProgram(gl);
    programs['forwardEdgeBounce'] = forwardEdgeBounceProgram(gl);
    programs['turn'] = turnProgram(gl);
    programs['bounceIf'] = bounceIfProgram(gl);
    programs['setPatch'] = setPatchProgram(gl);
    programs['getPatch'] = getPatchProgram(gl);
    programs['genericGet'] = genericGetProgram(gl);
    programs['genericSet'] = genericSetProgram(gl);
    programs['drawPatch'] = drawPatchProgram(gl);
    programs['diffusePatch'] = diffusePatchProgram(gl);
    programs['debugBreed'] = debugBreedProgram(gl);
    programs['debugPatch'] = debugPatchProgram(gl);

    myBreed = new Breed(gl, 25000);
    myBreed.addOwnVariable('buf');
    myBreed.addOwnVariable('buf2');

    myPatch = new Patch('Number');

    debugTexture1 = createTexture(gl, new Float32Array(T*T*4), gl.FLOAT, T, T);
    debugTexture2 = createTexture(gl, new Float32Array(FW*FH*4), gl.FLOAT, FW, FH);


    var tmp = createTexture(gl, new Float32Array(T * T * 4), gl.FLOAT, T, T);
    framebufferT = gl.createFramebuffer();
    initFramebuffer(gl, framebufferT, tmp, gl.FLOAT, T, T);
    gl.deleteTexture(tmp);

    var tmp = createTexture(gl, new Float32Array(FW*FH*4), gl.FLOAT, FW, FH);
    framebufferF = gl.createFramebuffer();
    initFramebuffer(gl, framebufferF, tmp, gl.FLOAT, FW, FH);
    gl.deleteTexture(tmp);

    var tmp = createTexture(gl, new Float32Array(FW*FH), gl.R32F, FW, FH);
    framebufferR = gl.createFramebuffer();
    initFramebuffer(gl, framebufferR, tmp, gl.R32F, FW, FH);
    gl.deleteTexture(tmp);

    window.requestAnimationFrame(runner);

    var code = document.getElementById('code');
    var codeArray = step.toString().split('\n');

    code.innerHTML = codeArray.splice(1, codeArray.length - 2).join('<br>');
};

function runner() {
    var start = performance.now();

    step();
    var now = performance.now();

    times.push({start: start, step: now - start});

    if (now - times[0].start > 1000 || times.length === 2) {
        while (now - times[0].start > 500) { times.shift() };
        var frameTime = (times[times.length-1].start - times[0].start) / (times.length - 1);
        var stepTime = times.reduce((a, b) => ({step: a.step + b.step})).step / times.length;
        readout.innerHTML = 'compute: ' + stepTime.toFixed(3) + ' msecs/step, real time: ' + frameTime.toFixed(1) + ' msecs/frame (' + (1000 / frameTime).toFixed(1) + ' fps)';
    }

    window.requestAnimationFrame(runner);
};

function step() {
    clear();

    myBreed.forwardEdgeBounce(0.5, [1, 0, 1, 1]);
    myBreed.turn(0.05);
    myBreed.genericGet(myBreed.buf, myBreed.pos);
    myBreed.genericSet(myBreed.buf, myBreed.buf2);
    myBreed.setPatch(myPatch, [200.0, 0.0, 0.0, 255.0]);
//    myBreed.genericSet(myPatch, [1.0, 0.0, 0.0, 1.0]);
    myPatch.diffuse();
    myPatch.draw();
    myBreed.draw();
}
