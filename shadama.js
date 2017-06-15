"use strict";

var TEXTURE_SIZE = 1024;
var FIELD_WIDTH = 512;
var FIELD_HEIGHT = 512;
var ENLARGE = 1;

var T = TEXTURE_SIZE;
var FW = FIELD_WIDTH;
var FH = FIELD_HEIGHT;

var readout;

var gl;

var runTests = false;

var breedVAO;
var patchVAO;

var programs = {};
var scripts = {};
var statics = {};
var staticsList = []; // [name];
var steppers = {};
var loadTime = 0.0;

var editor;
var parseErrorWidget;
var compilation;
var setupCode;
var programName = null;
var watcherList;  // DOM
var watcherElements = []; // [DOM]

var debugCanvas1;
var debugArray;
var debugArray1;
var debugArray2;

var times = [];

var framebufferT;
var framebufferF;
var framebufferR;
var framebufferD;

var debugTexture0;
var debugTexture1;

var env = {};


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
    var newSetupCode;
    var oldProgramName = programName;
    statics = {};
    staticsList = [];
    if (!source) {
        var scriptElement = document.getElementById(id);
        if(!scriptElement){return "";}
        source = scriptElement.text;
    }
    cleanUpEditorState();
    var result = translate(source, "TopLevel", syntaxError);
    compilation = result;
    if (!result) {return "";}
    if (oldProgramName != result["_programName"]) {
        resetSystem();
    }
    programName = result["_programName"];
    delete result["_programName"];

    for (var k in result) {
        if (typeof result[k] === "string") { // static mathod case
            statics[k] = eval(result[k]);
            staticsList.push(k);
            if (k === "setup") {
                newSetupCode = result[k];
            }
        } else {
            var entry = result[k];
            var js = entry[3];
            if (js[0] === "updateBreed") {
                update(Breed, js[1], js[2]);
            } else if (js[0] === "updatePatch") {
                update(Patch, js[1], js[2]);
            } else if (js[0] === "updateScript") {
                var table = entry[0];
                scripts[js[1]] = [programFromTable(table, entry[1], entry[2], js[1]),
                                  table.insAndParamsAndOuts()];
            }
        }
    }

    if (setupCode !== newSetupCode) {
        callSetup();
        setupCode = newSetupCode;
    }
    populateList(staticsList);
    return source;
};

function createTexture(gl, data, type, width, height) {
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
    gl.bindTexture(gl.TEXTURE_2D, tex);

    if (type == gl.UNSIGNED_BYTE) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, type, data);
    } else if (type == gl.R32F) {
        gl.texImage2D(gl.TEXTURE_2D, 0, type, width, height, 0, gl.RED, gl.FLOAT, data);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, type, data);
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
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, buffer);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    if (format == gl.R32F) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, null);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, format, null);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
};

function setTargetBuffer(gl, buffer, tex) {
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
};

function setTargetBuffers(gl, buffer, tex) {
    var list = [];
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, buffer);
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
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
};

function textureCopy(obj, src, dst) {
    var prog = programs["copy"];
    var width;
    var height;
    var buffer;
    if (obj.constructor === Breed) {
        width = T;
        height = T;
        buffer = framebufferT;
    } else {
        width = FW;
        height = FH;
        buffer = framebufferR;
    }

    setTargetBuffer(gl, buffer, dst);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);

    gl.viewport(0, 0, width, height);

    gl.uniform1i(prog.uniLocations["u_value"], 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.flush();
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
};

function randomDirection() {
    var r = Math.random();
    var r = r * Math.PI * 2.0;
    return [Math.cos(r), Math.sin(r)];
};

function randomPosition() {
    return [Math.random() * FW, Math.random() * FH];
};

var updateOwnVariable = function(obj, name, optData) {
    var width;
    var height;
    var ary;
    if (obj.constructor === Breed) {
        var width = T;
        var height = T;
    } else {
        var width = FW;
        var height = FH;
    }

    if (!optData) {
        ary = new Float32Array(width * height);
    } else {
        ary = optData;
    }

    if (obj[name]) {
        gl.deleteTexture(obj[name]);
    }
    if (obj["new"+name]) {
        gl.deleteTexture(obj["new"+name]);
    }

    obj.own[name] = name;
    obj[name] = createTexture(gl, ary, gl.R32F, width, height);
    obj["new"+name] = createTexture(gl, ary, gl.R32F, width, height);
};

var removeOwnVariable = function(obj, name) {
    delete obj.own[name];
    if (obj[name]) {
        gl.deleteTexture(obj[name]);
        delete obj[name];
    }
    if (obj["new"+name]) {
        gl.deleteTexture(obj["new"+name]);
        delete obj["new"+name];
    }
};

function Breed(count) {
    this.own = {};
    this.count = count;
};

Breed.prototype.fillRandom = function(name, min, max) {
    var ary = new Float32Array(T * T);
    var range = max - min;
    for (var i = 0; i < ary.length; i++) {
        ary[i] = Math.random() * range + min;
    }
    updateOwnVariable(this, name, ary);
};

Breed.prototype.fillRandomDir = function(xName, yName) {
    var x = new Float32Array(T * T);
    var y = new Float32Array(T * T);
    for (var i = 0; i < x.length; i++) {
        var dir = Math.random() * Math.PI * 2.0;
        x[i] = Math.cos(dir);
        y[i] = Math.sin(dir);
    }
    updateOwnVariable(this, xName, x);
    updateOwnVariable(this, yName, y);
};

Breed.prototype.fillSpace = function(xName, yName, xDim, yDim) {
    this.count = xDim * yDim;
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
};

Breed.prototype.fill = function(name, value) {
    var x = new Float32Array(T * T);

    for (var j = 0; j < this.count; j++) {
        x[j] = value;
    }
    updateOwnVariable(this, name, x);
};

Breed.prototype.fillImage = function(xName, yName, rName, gName, bName, aName, imagedata) {
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
};

function Patch() {
   this.own = {};
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
    return makePrimitive(gl, "diffusePatch", ["u_value"], patchVAO);
};

function copyProgram(gl) {
    return makePrimitive(gl, "copy", ["u_value"], patchVAO);
};

function debugFrameProgram(gl) {
    return makePrimitive(gl, "debugFrame", ["u_this_r", "u_this_g", "u_this_b", "u_this_a"], breedVAO);
};

Breed.prototype.draw = function() {
    var prog = programs["drawBreed"];
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    //    gl.blendFunc(gl.ONE, gl.ONE);

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

Breed.prototype.debugFrame = function() {
    var prog = programs["debugFrame"];

    var targets = ["r", "g", "b", "a"].map((n) => this["new" + n]);
    setTargetBuffers(gl, framebufferT, targets);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    //    gl.blendFunc(gl.ONE, gl.ONE);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.r);
    gl.uniform1i(prog.uniLocations["u_this_r"], 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.g);
    gl.uniform1i(prog.uniLocations["u_this_g"], 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.b);
    gl.uniform1i(prog.uniLocations["u_this.b"], 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.a);
    gl.uniform1i(prog.uniLocations["u_this_a"], 3);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);

    gl.drawArrays(gl.POINTS, 0, this.count);

    gl.flush();
    gl.disable(gl.BLEND);

    ["r", "g", "b", "a"].forEach((n) => {
	var tmp = this["new"+n];
	this["new"+n] = this[n];
	this[n] = tmp;
    });
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
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
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

    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
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
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
};

Patch.prototype.diffuse = function(name) {
    var prog = programs["diffusePatch"];

    var target = this["new"+name];
    var source = this[name];

    setTargetBuffer(gl, framebufferR, target);

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);

    gl.viewport(0, 0, FW, FH);

    gl.uniform1i(prog.uniLocations["u_value"], 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.flush();
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    this["new"+name] = source;
    this[name] = target;
};

function debugDisplay(objName, name) {
    debugger;
    var object = env[objName];
    var forBreed = object.constructor == Breed;
    var width = forBreed ? T : FW;
    var height = forBreed ? T : FH;

    if (!debugCanvas1) {
        debugCanvas1 = document.getElementById("debugCanvas1");
        debugCanvas1.width = width;
        debugCanvas1.height = height;
    }
    var prog = programs["debugPatch"];

    if (forBreed) {
        setTargetBuffer(gl, framebufferD, debugTexture0);
    } else {
        setTargetBuffer(gl, framebufferF, debugTexture1);
    }

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    var tex = object[name];

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.viewport(0, 0, width, height);

    gl.uniform1i(prog.uniLocations["u_value"], 0);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();

    debugArray = new Float32Array(width * height * 4);
    debugArray1 = new Float32Array(width * height);
    debugArray2 = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.R32F, gl.FLOAT, debugArray);

    for (var i = 0; i < width * height; i++) {
        debugArray1[i] = debugArray[i * 4 + 0];
    }

    console.log(debugArray1);

    for (var i = 0; i < width * height; i++) {
        debugArray2[i * 4 + 0] = debugArray[i * 4 + 0];
        debugArray2[i * 4 + 1] = debugArray[i * 4 + 1];
        debugArray2[i * 4 + 2] = debugArray[i * 4 + 2];
        debugArray2[i * 4 + 3] = debugArray[i * 4 + 3];
    }

    var img = new ImageData(debugArray2, width, height);
    debugCanvas1.getContext("2d").putImageData(img, 0, 0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
};

function update(cls, name, fields) {
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
        return obj;
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
        return; obj;
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
};

function programFromTable(table, vert, frag, name) {
    return (function () {
        var debugName = name;
	if (debugName === "cream") {
	}
        var prog = createProgram(gl, createShader(gl, name + ".vert", vert),
                                 createShader(gl, name + ".frag", frag));
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
            var uni = "u_use_vector_" + name;
            uniLocations[uni] = gl.getUniformLocation(prog, uni);
            uni = "u_vector_" + name;
            uniLocations[uni] = gl.getUniformLocation(prog, uni);
            uni = "u_scalar_" + name;
            uniLocations[uni] = gl.getUniformLocation(prog, uni);
        });

        return function(objects, outs, ins, params) {
            // objects: {varName: object}
            // outs: [[varName, fieldName]]
            // ins: [[varName, fieldName]]
            // params: {shortName: value}
	    if (debugName === "cream") {
	    }
            var object = objects["this"];

            outs.forEach((pair) => {
                textureCopy(objects[pair[0]],
                            objects[pair[0]][pair[1]],
                            objects[pair[0]]["new" + pair[1]])});

            var targets = outs.map(function(pair) {return objects[pair[0]]["new" + pair[1]]});
            if (forBreed) {
                setTargetBuffers(gl, framebufferT, targets);
            } else {
                setTargetBuffers(gl, framebufferF, targets);
            }

            gl.useProgram(prog);
            gl.bindVertexArray(vao);

            gl.viewport(0, 0, viewportW, viewportH);
            gl.uniform2f(uniLocations["u_resolution"], FW, FH);
            gl.uniform1f(uniLocations["u_particleLength"], T);

            var offset = 0;
            if (!forBreed || hasPatchInput) {
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
                gl.uniform1i(uniLocations["u" + "_" + pair[0] + "_" + k], ind + offset);
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

//            if (forBreed) {
//                gl.clearColor(0.0, 0.0, 0.0, 0.0);
//                gl.clear(gl.COLOR_BUFFER_BIT);
//            }
            gl.drawArrays(gl.POINTS, 0, object.count);
            gl.flush();
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
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

function cleanUpEditorState() {
    if (editor) {
        if (parseErrorWidget) {
            editor.removeLineWidget(parseErrorWidget);
            parseErrorWidget = undefined;
        }
        editor.getAllMarks().forEach(function(mark) { mark.clear(); });
    }
};

function syntaxError(match, src) {
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
        setTimeout(
            function() {
                if (editor.getValue() === src && !parseErrorWidget) {
                    function repeat(x, n) {
                        var xs = [];
                        while (n-- > 0) {
                            xs.push(x);
                        }
                        return xs.join('');
                    }
                    var msg = 'Expected: ' + match.getExpectedText();
                    var pos = editor.doc.posFromIndex(match.getRightmostFailurePosition());
                    var error = toDOM(['parseerror', repeat(' ', pos.ch) + '^\n' + msg]);
                    parseErrorWidget = editor.addLineWidget(pos.line, error);
                }
            },
            2500
        );
    }
};

function resetSystem() {
    for (var s in steppers) {
        stopClock(detectEntry(s).clock);
    }
    removeAll();

    scripts = {};
    statics = {};
    staticsList = [];
    steppers = {};
    setupCode = null;
    programName = null;

    for (var o in env) {
        var obj = env[o];
        if (typeof obj == "object" && (obj.constructor == Breed || obj.constructor == Patch)) {
            for (var k in obj.own) {
                var tex = obj[k];
                if (tex.constructor === WebGLTexture) {
                    gl.deleteTexture(obj[k]);
                }
            }
            delete env[o];
        }
    }
};

function updateCode() {
    var code = editor.getValue();
    loadShadama(null, code);
    if (!programName) {
        programName = prompt("Enter the program name:", "My Cool Effect!");
        if (!programName) {
            alert("program not saved");
            return;
        }
	code = "program " + '"' + programName + '"\n' + code;
        editor.setValue(code);
    }
    localStorage.setItem(programName + ".shadama", code);
    initFileList(programName);
};

function callSetup() {
    loadTime = performance.now() / 1000.0;
    env["time"] = 0.0;
    if (statics["setup"]) {
        statics["setup"](env);
    }
};

function addListeners(aCanvas) {
    var rect = aCanvas.getBoundingClientRect();
    var left = rect.left;
    var top = rect.top;
    aCanvas.addEventListener("mousemove", function(e) {
        env.mousemove = {x: e.clientX - left, y: FH - (e.clientY - top)};
    });
    aCanvas.addEventListener("mousedown", function(e) {
        env.mousedown = {x: e.clientX, y: FH - (e.clientY - top)};
    });
    aCanvas.addEventListener("mouseup", function(e) {
        env.mouseup = {x: e.clientX, y: FH - (e.clientY - top)};
    });
};

function emptyImageData(width, height) {
    var ary = new Uint8ClampedArray(width * height * 4);
    for (var i = 0; i < width * height; i++) {
        ary[i * 4 + 0] = i;
        ary[i * 4 + 1] = 0;
        ary[i * 4 + 2] = 0;
        ary[i * 4 + 3] = 255;
    }
    return new ImageData(ary, 256, 256);
};

function initServerFiles() {
    var location = window.location.toString();
    var examples = [
	"1-Fill.shadama", "2-Disperse.shadama", "3-Gravity.shadama", "4-Two Circles.shadama", "5-Bounce.shadama", "6-Picutre.shadama", "7-Duck Bounce.shadama", "8-Back and Forth.shadama", "9-Mandelbrot.shadama"
    ];

    if (!location.startsWith("http")) {return;}

    var slash = location.lastIndexOf("/");
    var dir = location.slice(0, slash) + "/" + "examples";
    examples.forEach((n) => {
	var file = dir + "/" + encodeURIComponent(n);
	console.log(file);
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
	    if (this.readyState == 4 && this.status == 200) {
		// Typical action to be performed when the document is ready:
		var serverCode = xhttp.responseText;
		var localCode = localStorage.getItem(n);
		if (!localCode) {
		    localStorage.setItem(n, serverCode);
		}
		initFileList();
	    }
	};
	xhttp.open("GET", file, true);
	xhttp.send();
    });
};

function initEnv(callback) {
    env.mousedown = {x: 0, y: 0};
    env.mousemove = {x: 0, y: 0};
    env.width = FW;
    env.height = FH;

    var img = document.createElement("img");
    var tmpCanvas = document.createElement("canvas");
    var location = window.location.toString();

    if (location.startsWith("http")) {
        var slash = location.lastIndexOf("/");
        var dir = location.slice(0, slash) + "/" + "ahiru.png";
        img.src = dir;
    } else {
        img.crossOrigin = "Anonymous";
        img.onerror = function() {
            console.log("no internet");
            document.body.removeChild(img);
            env.image = emptyImageData(256, 256);
            callback();
        }
        img.src = "http://tinlizzie.org/~ohshima/ahiru/ahiru.png";
    }

    img.onload = function() {
        tmpCanvas.width = img.width;
        tmpCanvas.height = img.height;
        tmpCanvas.getContext('2d').drawImage(img, 0, 0);
        env.image = tmpCanvas.getContext('2d').getImageData(0, 0, img.width, img.height);
        document.body.removeChild(img);
        callback();
    }
    document.body.appendChild(img);
};

function makeClock() {
    var aClock = document.createElement("canvas");
    aClock.width = 40;
    aClock.height = 40;
    aClock.ticking = false;
    aClock.hand = 0;
    drawClock(aClock, 0, false);

    aClock.onclick = function () {toggleScript(aClock.entry.scriptName)};

    return aClock;
};

function stopClock(aClock) {
    aClock.ticking = false;
    drawClock(aClock);
};

function startClock(aClock) {
    aClock.ticking = true;
    drawClock(aClock);
};

function stopScript(name) {
    delete steppers[name];
    stopClock(detectEntry(name).clock);
};

function startScript(name) {
    steppers[name] = name;
    startClock(detectEntry(name).clock);
};

function toggleScript(name) {
    if (steppers[name]) {
        stopScript(name);
    } else {
        startScript(name);
    }
};

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
};

function makeEntry(name) {
    var entry = document.createElement("div");
    var aClock = makeClock();
    entry.scriptName = name;
    entry.appendChild(aClock);
    entry.clock = aClock;
    aClock.entry = entry;
    var button = document.createElement("div");
    button.className = "staticName";
    button.innerHTML = name;
    button.onclick = function() {
        env["time"] = (performance.now() / 1000) - loadTime;
        if (statics[entry.scriptName]) {
            statics[entry.scriptName](env);
        }
    };
    entry.appendChild(button);
    return entry;
};

function detectEntry(name) {
    for (var j = 0; j < watcherList.children.length; j++) {
        var oldEntry = watcherList.children[j];
        if (oldEntry.scriptName === name) {return oldEntry;}
    }
    return null;
};

function removeAll() {
    while (watcherList.firstChild) {
	watcherList.removeChild(watcherList.firstChild);
    }
};

function addAll(elems) {
    for (var j = 0; j < elems.length; j++) {
        watcherList.appendChild(elems[j]);
    }
};

function updateClocks() {
    for (var j = 0; j < watcherList.children.length; j++) {
        var child = watcherList.children[j];
        var aClock = child.clock;
        if (aClock.ticking) {
            aClock.hand = (aClock.hand + 2) % 360;
        }
        drawClock(aClock);
    }
};

function populateList(newList) {
    watcherElements = [];
    for (var i = 0; i < newList.length; i++) {
        var name = newList[i];
        var entry = detectEntry(name);
        if (!entry) {
            entry = makeEntry(name);
        }
        watcherElements.push(entry);
    }
    removeAll();
    addAll(watcherElements);

    if (statics["loop"]) {
        startScript("loop");
    }
};

function selectFile(dom) {
    if (dom.selectedIndex > 0) {// 0 is for the default label
        var option = dom.options[dom.selectedIndex];
        var name = option.label;
        var source = localStorage.getItem(name);
        if (source) {
            console.log("loading: " + name);
            resetSystem();
            loadShadama(null, source);
	    if (editor) {
		editor.doc.setValue(source);
	    }
        }
    }
};

function initFileList(optSelection) {
    if (optSelection) {
        if (!optSelection.endsWith(".shadama")) {
            optSelection = optSelection + ".shadama";
        }
    }
    var dom = document.getElementById("myDropdown");
    dom.onchange = function() {selectFile(dom);};
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
};

onload = function() {
    runTests = /test.?=/.test(window.location.search);

    if (runTests) {
        setTestParams();
        document.getElementById("bigTitle").innerHTML = "Shadama Tests";
    }

    readout = document.getElementById("readout");
    watcherList = document.getElementById("watcherList");

    var c = document.getElementById("canvas");
    c.width = FW;
    c.height = FH;
    c.style.width = (FW * ENLARGE) + "px";
    c.style.height = (FH * ENLARGE) + "px";

    addListeners(c);

    gl = c.getContext("webgl2");

    var ext = gl.getExtension("EXT_color_buffer_float");

    initBreedVAO(gl);
    initPatchVAO(gl);
    initCompiler();
    initServerFiles();
    initFileList();

    programs["drawBreed"] = drawBreedProgram(gl);
    programs["drawPatch"] = drawPatchProgram(gl);
    programs["debugPatch"] = debugPatchProgram(gl);
    programs["diffusePatch"] = diffusePatchProgram(gl);
    programs["copy"] = copyProgram(gl);
    programs["debugFrame"] = debugFrameProgram(gl);

    debugTexture0 = createTexture(gl, new Float32Array(T*T*4), gl.FLOAT, T, T)
    debugTexture1 = createTexture(gl, new Float32Array(FW*FH*4), gl.FLOAT, FW, FH);

    var tmp = createTexture(gl, new Float32Array(T * T), gl.R32F, T, T);
    framebufferT = gl.createFramebuffer();
    initFramebuffer(gl, framebufferT, tmp, gl.R32F, T, T);
    gl.deleteTexture(tmp);

    var tmp = createTexture(gl, new Float32Array(FW*FH), gl.R32F, FW, FH);
    framebufferR = gl.createFramebuffer();
    initFramebuffer(gl, framebufferR, tmp, gl.R32F, FW, FH);
    gl.deleteTexture(tmp);

    var tmp = createTexture(gl, new Float32Array(FW*FH*4), gl.FLOAT, FW, FH);
    framebufferF = gl.createFramebuffer();
    initFramebuffer(gl, framebufferF, tmp, gl.FLOAT, FW, FH);
    gl.deleteTexture(tmp);

    var tmp = createTexture(gl, new Float32Array(T*T*4), gl.FLOAT, T, T);
    framebufferD = gl.createFramebuffer();
    initFramebuffer(gl, framebufferD, tmp, gl.FLOAT, FW, FH);
    gl.deleteTexture(tmp);



    if (runTests) {
        grammarUnitTests();
        symTableUnitTests();
        translateTests();
        test();
        return;
    }

    if (!editor) {
        function words(str) { let o = {}; str.split(" ").forEach((s) => o[s] = true); return o; }
        CodeMirror.defineMIME("text/shadama", {
            name: "clike",
            keywords: words("program breed patch def static var if else"),
            atoms: words("true false this self width height image mousedown mousemove mouseup"),
        });

        editor = CodeMirror.fromTextArea(document.getElementById("code"), {
            mode: "text/shadama",
            matchBrackets: true,
            "extraKeys": {
                "Cmd-S": function(cm) {updateCode()},
            },
        });
    }

    initEnv(function() {
        var source = loadShadama("forward.shadama");
        if (editor) {
            editor.doc.setValue(source);
        }
        runner();
    });
};

function runner() {
    var start = performance.now();
    step();
    var now = performance.now();

    times.push({start: start, step: now - start});

    if ((times.length > 0 && now - times[0].start > 1000) || times.length === 2) {
        while (times.length > 1 && now - times[0].start > 500) { times.shift() };
        var frameTime = (times[times.length-1].start - times[0].start) / (times.length - 1);
        var stepTime = times.reduce((a, b) => ({step: a.step + b.step})).step / times.length;
        readout.innerHTML = "compute: " + stepTime.toFixed(3) + " msecs/step, real time: " + frameTime.toFixed(1) + " msecs/frame (" + (1000 / frameTime).toFixed(1) + " fps)";
    }

    updateClocks();

    window.requestAnimationFrame(runner);
};

function step() {
    env["time"] = (performance.now() / 1000) - loadTime;
    for (var k in steppers) {
        var func = statics[k];
        if (func) {
            func(env);
        }
    }
}
