"use strict";

var TEXTURE_SIZE = 512;
var FIELD_WIDTH = 256;
var FIELD_HEIGHT = 256;
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
var scripts = {};
var myObjects = {};

var shadama;
var loop;
var setup;

var editor;

var compilation;

var debugCanvas1;

var debugArray;
var debugArray2;

var times = [];

var framebufferT;
var framebufferF;
var framebufferR;

var debugTexture0;
var debugTexture1;
var debugTexture2;

var g;
var s;

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

function createShader(gl, id, source) {
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

function loadShadama(id, source) {
    if (!source) {
        var scriptElement = document.getElementById(id);
        if(!scriptElement){return;}
        source = scriptElement.text;
    }
    shadama = source;
    var result = translate(source, "TopLevel");
    compilation = result;
    for (var k in result) {
        if (k === "loop") {
            loop = eval(result[k]);
        } else if (k === "setup") {
            setup = eval(result[k]);
	} else {
            var entry = result[k];
            var js = entry[3];
            if (js[0] === "updateBreed") {
                updateBreed(js[1], js[2]);
            } else if (js[0] === "updatePatch") {
                updatePatch(js[1], js[2]);
            } else if (js[0] === "updateScript") {
                var table = entry[0];
                scripts[js[1]] = [programFromTable(table, entry[1], entry[2], js[1]),
                                  table.insAndParamsAndOuts()];
            }
        }
    }
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

function setTargetBuffers(gl, buffer, tex) {
    var list = [];
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    for (var i = 0; i < tex.length; i++) {
        var val = gl.COLOR_ATTACHMENT0 + i;
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, val, gl.TEXTURE_2D, tex[i], 0);
        list.push(val);
    }
    gl.drawBuffers(list);
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

function clear() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
};

function randomDirection() {
    var r = Math.random();
    var r = r * Math.PI * 2.0;
    return [Math.cos(r), Math.sin(r)];
};

function randomPosition() {
    return [Math.random() * FW, Math.random() * FH];
};

function Breed(count) {
    this.own = {};
    this.count = count;
};

Breed.prototype.addOwnVariable = function(name) {
    var ary = new Float32Array(T * T);
    this.own[name] = name;
    this[name] = createTexture(gl, ary, gl.R32F);
    this["new"+name] = createTexture(gl, ary, gl.R32F);
};

Breed.prototype.fillRandom = function(name, min, max) {
    if (this[name]) {
        gl.deleteTexture(this[name]);
    }
    var ary = new Float32Array(T * T * 4);
    var range = max - min;
    for (var i = 0; i < ary.length; i++) {
        ary[i] = Math.random() * range + min;
    }
    this[name] = createTexture(gl, ary, gl.R32F);
};


Breed.prototype.fillRandomDir = function(xName, yName) {
    if (this[xName]) {
        gl.deleteTexture(this[xName]);
    }
    if (this[yName]) {
        gl.deleteTexture(this[yName]);
    }

    var x = new Float32Array(T * T * 4);
    var y = new Float32Array(T * T * 4);
    for (var i = 0; i < x.length; i++) {
        var dir = Math.random() * Math.PI * 2.0;
        x[i] = Math.cos(dir);
        y[i] = Math.sin(dir);
    }
    this[xName] = createTexture(gl, x, gl.R32F);
    this[yName] = createTexture(gl, y, gl.R32F);
};

Breed.prototype.fillSpace = function(xName, yName, xDim, yDim) {
    this.count = xDim * yDim;
    if (this[xName]) {
        gl.deleteTexture(this[xName]);
    }
    if (this[yName]) {
        gl.deleteTexture(this[yName]);
    }

    var x = new Float32Array(T * T * 4);
    var y = new Float32Array(T * T * 4);

    for (var j = 0; j < yDim; j++) {
        for (var i = 0; i < xDim; i++) {
//          var ind = i * j;
            var ind = xDim * j + i;
            x[ind*4] = i;
            y[ind*4] = j;
        }
    }
    this[xName] = createTexture(gl, x, gl.R32F);
    this[yName] = createTexture(gl, y, gl.R32F);
};

function Patch() {
   this.own = {};
};

Patch.prototype.addOwnVariable = function(name) {
    var ary = new Float32Array(FW * FH * 4);
    this.own[name] = name;
    this[name] = createTexture(gl, ary, gl.R32F);
    this["new"+name] = createTexture(gl, ary, gl.R32F);
};

function makePrimitive(gl, name, uniforms, vao) {
    var vs = createShader(gl, name + ".vert");
    var fs = createShader(gl, name + ".frag");

    var prog = createProgram(gl, vs, fs);

    var uniLocations = {};
    uniforms.forEach(function (n) {
        uniLocations[n] = gl.getUniformLocation(prog, n);
    });

    return {program: prog, uniLocations: uniLocations, vao: vao};
};

function drawBreedProgram(gl) {
    return makePrimitive(gl, "drawBreed", ["u_resolution", "u_particleLength", "u_x", "u_y", "u_r", "u_g", "u_b", "u_a"], breedVAO);
};

function drawPatchProgram(gl) {
    return makePrimitive(gl, "drawPatch", ["u_a", "u_r", "u_g", "u_b"], patchVAO);
};

function debugPatchProgram(gl) {
    return makePrimitive(gl, "debugPatch", ["u_value"], patchVAO);
};

function diffusePatchProgram(gl) {
    return makePrimitive(gl, "diffusePatch", ["u_resolution", "u_value"], patchVAO);
};

function debugBreedProgram(gl) {
    return makePrimitive(gl, "debugBreed", ["u_particleLength", "u_value"], breedVAO);
};

Breed.prototype.draw = function() {
    var prog = programs["drawBreed"];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.x);
    gl.uniform1i(prog.uniLocations["u_x"], 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.y);
    gl.uniform1i(prog.uniLocations["u_y"], 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.r);
    gl.uniform1i(prog.uniLocations["u_r"], 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.g);
    gl.uniform1i(prog.uniLocations["u_g"], 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.b);
    gl.uniform1i(prog.uniLocations["u_b"], 4);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.a);
    gl.uniform1i(prog.uniLocations["u_a"], 5);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);

    gl.drawArrays(gl.POINTS, 0, this.count);

    gl.flush();
    gl.disable(gl.BLEND);
};

Breed.prototype.increasePatch = function(patch, value) {
    var prog = programs["setPatch"];  // the same program but with blend enabled.
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

Breed.prototype.setCount = function(n) {
    var oldCount = this.count;
    if (n < 0 || !n) {
        n = 0;
    }
    this.count = n;
    //
};

Patch.prototype.draw = function() {
    var prog = programs["drawPatch"];

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.r);
    gl.uniform1i(prog.uniLocations["u_r"], 0);

    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.g);
    gl.uniform1i(prog.uniLocations["u_g"], 1);

    gl.activeTexture(gl.TEXTURE0 + 2);
    gl.bindTexture(gl.TEXTURE_2D, this.b);
    gl.uniform1i(prog.uniLocations["u_b"], 2);

    gl.activeTexture(gl.TEXTURE0 + 3);
    gl.bindTexture(gl.TEXTURE_2D, this.a);
    gl.uniform1i(prog.uniLocations["u_a"], 3);


    gl.viewport(0, 0, FW, FH);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

Patch.prototype.diffuse = function() {
    var prog = programs["diffusePatch"];

    setTargetBuffer(gl, framebufferF, this.newValues);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.values);

    gl.viewport(0, 0, FW, FH);

    gl.uniform1i(prog.uniLocations["u_value"], 0);
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

function debugDisplay0(gl, breed, name) {
    if (!debugCanvas1) {
        debugCanvas1 = document.getElementById("debugCanvas1");
        debugCanvas1.width = T;
        debugCanvas1.height = T;
    }
    var prog = programs["debugBreed"];
    setTargetBuffer(gl, framebufferR, debugTexture0);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, breed[name]);

    gl.viewport(0, 0, T, T);

    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_value"], 0);

    gl.drawArrays(gl.POINTS, 0, breed.count);
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
    debugCanvas1.getContext("2d").putImageData(img, 0, 0);
};

function debugDisplay1(gl, tex) {
    if (!debugCanvas1) {
        debugCanvas1 = document.getElementById("debugCanvas1");
        debugCanvas1.width = T;
        debugCanvas1.height = T;
    }
    var prog = programs["debugBreed"];
    setTargetBuffer(gl, framebufferT, debugTexture1);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.viewport(0, 0, T, T);

    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_value"], 0);

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
    debugCanvas1.getContext("2d").putImageData(img, 0, 0);
};

function debugDisplay2(gl, tex) {
    if (!debugCanvas1) {
        debugCanvas1 = document.getElementById("debugCanvas1");
        debugCanvas1.width = FW;
        debugCanvas1.height = FH;
    }
    var prog = programs["debugPatch"];
    setTargetBuffer(gl, framebufferF, debugTexture2);

    gl.useProgram(prog.program);
    gl.bindVertexArray(patchVAO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.uniform1i(prog.uniLocations["u_value"], 0);

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
    debugCanvas1.getContext("2d").putImageData(img, 0, 0);
};

function updateBreed(name, fields) {
    var breed = myObjects[name];
    if (!breed) {
        breed = new Breed();
        for (var i = 0; i < fields.length; i++) {
            breed.addOwnVariable(fields[i]);
        }
        myObjects[name] = breed;
        return breed;
    }

    // oldOwn = breed.own;
    // var toBeDeleted = [];
    // var toBeCreated = [];
    // var newOwn = {};

    // for (var k in oldOwn) {
    //     if (fields.indexOf(k) < 0) {
    //         toBeDeleted.push(k)

    //     }
    // }

    // for (var i = 0; i < fields.length; i++) {
    //     var n = fields[i];
    //     if (oldOwn[fields[i]]) {
    //         newOwn[fields[i]] = oldOwn[fields[i]];
    //     } else {
    //         toBeCreated.push(fields[i]);
    //     }
    // }

    // breed.own = newOwn;
    // for (var i = 0; i < toBeCreated.length; i++) {
    //     breed.addOwnVariable(toBeCreated[i]);
    // }
    // for (var i = 0; i < toBeDeleted.length; i++) {
    //     // gl.destroyTexture(oldOwn[toBeDeleted[i]]);
    // }
};

function updatePatch(name, fields) {
    var patch = myObjects[name];
    if (!patch) {
        patch = new Patch();
        for (var i = 0; i < fields.length; i++) {
            patch.addOwnVariable(fields[i]);
        }
        myObjects[name] = patch;
        return patch;
    }

    // oldOwn = patch.own;
    // var toBeDeleted = [];
    // var toBeCreated = [];
    // var newOwn = {};

    // for (var k in oldOwn) {
    //     if (fields.indexOf(k) < 0) {
    //         toBeDeleted.push(k)
    //     }
    // }

    // for (var i = 0; i < fields.length; i++) {
    //     var n = fields[i];
    //     if (oldOwn[fields[i]]) {
    //         newOwn[fields[i]] = oldOwn[fields[i]];
    //     } else {
    //         toBeCreated.push(fields[i]);
    //     }
    // }

    // patch.own = newOwn;
    // for (var i = 0; i < toBeCreated.length; i++) {
    //     breed.addOwnVariable(toBeCreated[i]);
    // }
    // for (var i = 0; i < toBeDeleted.length; i++) {
    //     // gl.destroyTexture(oldOwn[toBeDeleted[i]]);
    // }
};

function programFromTable(table, vert, frag, name) {
    return (function () {
        var prog = createProgram(gl, createShader(gl, name + ".vert", vert),
                                 createShader(gl, name + ".frag", frag));
        var vao = breedVAO;
        var uniLocations = {};
        
        var viewportW = table.forPatch ? FW : T;
        var viewportH = table.forPatch ? FH : T;

        table.defaultUniforms.forEach(function(n) {
            uniLocations[n] = gl.getUniformLocation(prog, n);
        });

        for (var n in table.uniformTable) {
            var uni = table.uniform(table.uniformTable[n]);
            uniLocations[uni] = gl.getUniformLocation(prog, uni);
        }

        for (var i = 0; i < table.scalarParamIndex.length; i++) {
            var n = table.scalarParamIndex[i];
            var entry = table.scalarParamTable[n];
            uni = "u_use_vector_" + entry[2];
            uniLocations[uni] = gl.getUniformLocation(prog, uni);
            uni = "u_vector_" + entry[2];
            uniLocations[uni] = gl.getUniformLocation(prog, uni);
            uni = "u_scalar_" + entry[2];
            uniLocations[uni] = gl.getUniformLocation(prog, uni);
        }

        return function(objects, outs, ins, params) {
            // objects: {varName: object}
            // outs: [[varName, fieldName]]
            // ins: [[varName, fieldName]]
            // params: {shortName: value}
            
            var object = objects["this"];
            var targets = outs.map(function(pair) {return objects[pair[0]]["new" + pair[1]]});
            setTargetBuffers(gl, framebufferR, targets);
            
            gl.useProgram(prog);
            gl.bindVertexArray(vao);
            
            gl.viewport(0, 0, viewportW, viewportH);
            gl.uniform2f(uniLocations["u_resolution"], FW, FH);
            gl.uniform1f(uniLocations["u_particleLength"], T);
            
            var offset = 0;
            if (table.forPatch) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, object.x);
                gl.uniform1i(uniLocations["u_that_x"], 0);
                
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, object.y);
                gl.uniform1i(uniLocations["u_that_y"], 1);
                offset = 2;
            }
            
            for (var ind = 0; ind < ins.length; ind++) {
                var pair = ins[ind];
                var glIndex = gl.TEXTURE0 + ind + offset;
                var k = pair[1]
                var val = objects[pair[0]][k];
                gl.activeTexture(glIndex);
                gl.bindTexture(gl.TEXTURE_2D, val);
                gl.uniform1i(uniLocations["u_this_" + k], ind + offset);
            }
            
            for (var k in params) {
                var val = params[k];
                if (val.constructor == WebGLTexture) {
                    var glIndex = gl.TEXTURE0 + ind + offset;
                    gl.activeTexture(glIndex);
                    gl.bindTexture(gl.TEXTURE_2D, val);
                    gl.uniform1i(uniLocations["u_vector_" + k], ind + offset);
                    ind++;
                } else {
                    gl.uniform1i(uniLocations["u_vector_" + k], 0);
                    gl.uniform1f(uniLocations["u_scalar_" + k], val);
                    gl.uniform1i(uniLocations["u_use_vector_" + k], 0);
                }
            }
            
            if (!table.forPatch) {
                gl.clearColor(0.0, 0.0, 0.0, 0.0);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            gl.drawArrays(gl.POINTS, 0, object.count);
            gl.flush();
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            
            for (var i = 0; i < outs.length; i++) {
                var pair = outs[i];
                var o = objects[pair[0]];
                var name = pair[1];
                var tmp = o[name];
                o[name] = o["new"+name];
                o["new"+name] = tmp;
            }
        }
    })();
};

onload = function() {
    readout = document.getElementById("readout");

    var c = document.getElementById("canvas");
    c.width = FW;
    c.height = FH;
    c.style.width = (FW * ENLARGE) + "px";
    c.style.height = (FH * ENLARGE) + "px";

    gl = c.getContext("webgl2");

    var ext = gl.getExtension("EXT_color_buffer_float");

    initBreedVAO(gl);
    initPatchVAO(gl);

    initCompiler();

    programs["drawBreed"] = drawBreedProgram(gl);
    programs["drawPatch"] = drawPatchProgram(gl);
    programs["debugBreed"] = debugBreedProgram(gl);

    debugTexture0 = createTexture(gl, new Float32Array(T*T), gl.R32F);
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

    var tmp = createTexture(gl, new Float32Array(T*T), gl.R32F, T, T);
    framebufferR = gl.createFramebuffer();
    initFramebuffer(gl, framebufferR, tmp, gl.R32F, T, T);
    gl.deleteTexture(tmp);

    grammarUnitTests();

    loadShadama("forward.shadama");

    var code = document.getElementById("code");
    code.value = shadama;

    editor = CodeMirror.fromTextArea(document.getElementById("code"));
    code.remove();

    if (setup) {
	setup.forEach(f => f());
    }

    runner();
};

function updateCode() {
    var code = editor.getValue();
    loadShadama(null, code);
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
        readout.innerHTML = "compute: " + stepTime.toFixed(3) + " msecs/step, real time: " + frameTime.toFixed(1) + " msecs/frame (" + (1000 / frameTime).toFixed(1) + " fps)";
    }

    window.requestAnimationFrame(runner);
};

function step() {
    if (loop) {
	loop.forEach(f => f());
    }
}
