var TEXTURE_SIZE = 256;
var FIELD_WIDTH = 768;
var FIELD_HEIGHT = 512;

var T = TEXTURE_SIZE;
var FW = FIELD_WIDTH;
var FH = FIELD_HEIGHT;

var src;
var dst;

var debugCanvas1;

var readout;

var debugArray;

var gl;
var VAOExt;
var floatExt;

var framebuffer;

var programs = {};

var allIndices;
var vertices;
var indicesIBO;

var myBreed;
var myPatch;

var frames;
var diffTime;


function initIndices(gl) {
    allIndices = new Array(T * T);
    for (var i = 0; i < T * T; i++) {
	allIndices[i] = i;
    }

    vertices = new Array(T * T * 2);
    for (var j = 0; j < T; j++) {
	for (i = 0; i < T; i++) {
	    var ind = (j * T + i) * 2;
	    vertices[ind + 0] = i;
	    vertices[ind + 1] = j;
	}
    }

    indicesIBO = createIBO(gl, allIndices);
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
    
    if (format != gl.UNSIGNED_BYTE) {
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, format, data);
    } else {
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, format, data);
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

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, format, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

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

function Breed(gl, count) {
    var imageData;

    var a = 0;

    var ary = new Float32Array(T * T * 4);
    for (var j = 0; j < T; j++) {
	for (var i = 0; i < T; i++) {
	    var ind = (j * T + i) * 4;
	    var r = randomDirection();
	    ary[ind + 0] = (a += 4);
	    ary[ind + 1] = j;
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
	    if (i > T/2) {
		var c = [0, 0, 255, 255];
	    } else {
		c = [255.0, 0, 0, 255];
	    }
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


function step() {
    frames++;
    var sTime = Date.now();


//----------------------
    clear();
    myBreed.forward(gl, 1.0);
    myBreed.setPatch(gl, myPatch, [0.0, 200.0, 200.0, 255.0]);
    myPatch.diffuse(gl);
    myBreed.turn(gl, 0.05);
    myPatch.draw(gl);
    myBreed.draw(gl);
//----------------------

    diffTime += (Date.now() - sTime);
    if (frames % 60 === 0) {
	readout.innerHTML = 'msecs/frame: ' + (diffTime / 60.0);
	diffTime = 0;
    }

    window.requestAnimationFrame(step);
};

onload = function() {
    debugCanvas1 = document.getElementById('debugCanvas1');
    debugCanvas1.width = FW;
    debugCanvas1.height = FH;

    readout = document.getElementById('readout');

    var c = document.getElementById('canvas');
    c.width = FW;
    c.height = FH;
    
    gl = c.getContext('webgl'); 

    VAOExt = gl.getExtension('OES_vertex_array_object');

    floatExt = gl.getExtension('OES_texture_float');
    if (!floatExt) {
	alert('float texture not supported');
	return;
    }

    programs['drawBreed'] = drawBreedProgram(gl);
    programs['forward'] = forwardProgram(gl);
    programs['turn'] = turnProgram(gl);
    programs['setPatch'] = setPatchProgram(gl);
    programs['drawPatch'] = drawPatchProgram(gl);
    programs['diffusePatch'] = diffusePatchProgram(gl);

    myBreed = new Breed(gl, 32768);

    myPatch = new Patch('Color');

    frames = 0;
    diffTime = 0;

    window.requestAnimationFrame(step);
};

function forwardProgram(gl) {
    var vs = createShader(gl, 'forward.vert');
    var fs = createShader(gl, 'forward.frag');
    
    var prog = createProgram(gl, vs, fs);
    
    var attrLocations = new Array(1);
    attrLocations[0] = gl.getAttribLocation(prog, 'a_position');
    
    var attrStrides = new Array(1);
    attrStrides[0] = 2;

    var uniLocations = {};
    uniLocations['u_resolution'] = gl.getUniformLocation(prog, 'u_resolution');
    uniLocations['u_particleLength'] = gl.getUniformLocation(prog, 'u_particleLength');
    uniLocations['u_position'] = gl.getUniformLocation(prog, 'u_position');
    uniLocations['u_amount'] = gl.getUniformLocation(prog, 'u_amount');
  

    // Create a vertex array object (attribute state)
    var vao = VAOExt.createVertexArrayOES();
    // and make it the one we're currently working with
    VAOExt.bindVertexArrayOES(vao);

    var positionBuffer = gl.createBuffer();
    set_buffer_attribute(gl, [positionBuffer], [vertices], attrLocations, attrStrides);


    return {program: prog, attrLocations: attrLocations, attrStrides: attrStrides, uniLocations: uniLocations, vao: vao};
};

function setPatchProgram(gl) {
    var vs = createShader(gl, 'setPatch.vert');
    var fs = createShader(gl, 'setPatch.frag');
    
    var prog = createProgram(gl, vs, fs);
    
    var attrLocations = new Array(1);
    attrLocations[0] = gl.getAttribLocation(prog, 'a_position');
    
    var attrStrides = new Array(1);
    attrStrides[0] = 2;

    var uniLocations = {};
    uniLocations['u_resolution'] = gl.getUniformLocation(prog, 'u_resolution');
    uniLocations['u_particleLength'] = gl.getUniformLocation(prog, 'u_particleLength');
    uniLocations['u_position'] = gl.getUniformLocation(prog, 'u_position');
    uniLocations['u_value'] = gl.getUniformLocation(prog, 'u_value');
    uniLocations['u_type'] = gl.getUniformLocation(prog, 'u_type');
  
    // Create a vertex array object (attribute state)
    var vao = VAOExt.createVertexArrayOES();
    // and make it the one we're currently working with
    VAOExt.bindVertexArrayOES(vao);

    var positionBuffer = gl.createBuffer();
    set_buffer_attribute(gl, [positionBuffer], [vertices], attrLocations, attrStrides);


    return {program: prog, attrLocations: attrLocations, attrStrides: attrStrides, uniLocations: uniLocations, vao: vao};
};

function drawPatchProgram(gl) {
    var vs = createShader(gl, 'drawPatch.vert');
    var fs = createShader(gl, 'drawPatch.frag');
    
    var prog = createProgram(gl, vs, fs);
    
    var attrLocations = new Array(1);
    attrLocations[0] = gl.getAttribLocation(prog, 'a_position');
    
    var attrStrides = new Array(1);
    attrStrides[0] = 2;

    var uniLocations = {};
    uniLocations['u_patch'] = gl.getUniformLocation(prog, 'u_patch');
  
    // Create a vertex array object (attribute state)
    var vao = VAOExt.createVertexArrayOES();
    // and make it the one we're currently working with
    VAOExt.bindVertexArrayOES(vao);

    var positionBuffer = gl.createBuffer();

    var rect = [
	-1.0,  1.0,
 	 1.0,  1.0,
        -1.0, -1.0,
         1.0,  1.0,
         1.0, -1.0,
        -1.0, -1.0,
    ];
    set_buffer_attribute(gl, [positionBuffer], [rect], attrLocations, attrStrides);

    return {program: prog, attrLocations: attrLocations, attrStrides: attrStrides, uniLocations: uniLocations, vao: vao, pos: positionBuffer};
};

function diffusePatchProgram(gl) {
    var vs = createShader(gl, 'diffusePatch.vert');
    var fs = createShader(gl, 'diffusePatch.frag');
    
    var prog = createProgram(gl, vs, fs);
    
    var attrLocations = new Array(1);
    attrLocations[0] = gl.getAttribLocation(prog, 'a_position');
    
    var attrStrides = new Array(1);
    attrStrides[0] = 2;

    var uniLocations = {};
    uniLocations['u_resolution'] = gl.getUniformLocation(prog, 'u_resolution');
    uniLocations['u_value'] = gl.getUniformLocation(prog, 'u_value');
  
    // Create a vertex array object (attribute state)
    var vao = VAOExt.createVertexArrayOES();
    // and make it the one we're currently working with
    VAOExt.bindVertexArrayOES(vao);

    var positionBuffer = gl.createBuffer();

    var rect = [
	-1.0,  1.0,
 	 1.0,  1.0,
        -1.0, -1.0,
         1.0,  1.0,
         1.0, -1.0,
        -1.0, -1.0,
    ];
    set_buffer_attribute(gl, [positionBuffer], [rect], attrLocations, attrStrides);

    return {program: prog, attrLocations: attrLocations, attrStrides: attrStrides, uniLocations: uniLocations, vao: vao, pos: positionBuffer};
};

function turnProgram(gl) {
    var vs = createShader(gl, 'turn.vert');
    var fs = createShader(gl, 'turn.frag');
    
    var prog = createProgram(gl, vs, fs);
    
    var attrLocations = new Array(1);
    attrLocations[0] = gl.getAttribLocation(prog, 'a_position');
    
    var attrStrides = new Array(1);
    attrStrides[0] = 2;

    var uniLocations = {};
    uniLocations['u_particleLength'] = gl.getUniformLocation(prog, 'u_particleLength');
    uniLocations['u_position'] = gl.getUniformLocation(prog, 'u_position');
    uniLocations['u_rot'] = gl.getUniformLocation(prog, 'u_rot');
  

    // Create a vertex array object (attribute state)
    var vao = VAOExt.createVertexArrayOES();
    // and make it the one we're currently working with
    VAOExt.bindVertexArrayOES(vao);

    var positionBuffer = gl.createBuffer();
    set_buffer_attribute(gl, [positionBuffer], [vertices], attrLocations, attrStrides);

    return {program: prog, attrLocations: attrLocations, attrStrides: attrStrides, uniLocations: uniLocations, vao: vao};
};

function drawBreedProgram(gl) {
    var vs = createShader(gl, 'drawBreed.vert');
    var fs = createShader(gl, 'drawBreed.frag');
    
    var prog = createProgram(gl, vs, fs);
    
    var attrLocations = new Array(1);
    attrLocations[0] = gl.getAttribLocation(prog, 'a_position');
    
    var attrStrides = new Array(1);
    attrStrides[0] = 2;

    var uniLocations = {};
    var uniLocations = {};
    uniLocations['u_resolution'] = gl.getUniformLocation(prog, 'u_resolution');
    uniLocations['u_particleLength'] = gl.getUniformLocation(prog, 'u_particleLength');
    uniLocations['u_position'] = gl.getUniformLocation(prog, 'u_position');
    uniLocations['u_color'] = gl.getUniformLocation(prog, 'u_color');

    // Create a vertex array object (attribute state)
    var vao = VAOExt.createVertexArrayOES();
    // and make it the one we're currently working with
    VAOExt.bindVertexArrayOES(vao);

    initIndices(gl);

    var positionBuffer = gl.createBuffer();
    set_buffer_attribute(gl, [positionBuffer], [vertices], attrLocations, attrStrides);

    return {program: prog, attrLocations: attrLocations, attrStrides: attrStrides, uniLocations: uniLocations, vao: vao};
}

function clear() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

Breed.prototype.draw = function(gl) {
    var prog = programs['drawBreed'];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(prog.program);
    VAOExt.bindVertexArrayOES(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.color);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.uniform2f(prog.uniLocations["u_resolution"], gl.canvas.width, gl.canvas.height);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations['u_position'], 0);
    gl.uniform1i(prog.uniLocations['u_color'], 1);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesIBO);
    gl.drawElements(gl.POINTS, this.count, gl.UNSIGNED_SHORT, 0);

    gl.flush();
};

Breed.prototype.forward = function(gl, amount) {
    var prog = programs['forward'];
    if (!framebuffer) {
	framebuffer = gl.createFramebuffer();
	initFramebuffer(gl, framebuffer, this.newPos, gl.FLOAT);
    } else {
	setTargetBuffer(gl, framebuffer, this.newPos);
    }

    gl.useProgram(prog.program);
    VAOExt.bindVertexArrayOES(prog.vao);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesIBO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.viewport(0, 0, T, T);

    gl.uniform2f(prog.uniLocations["u_resolution"], gl.canvas.width, gl.canvas.height);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_position"], 0);
    gl.uniform1f(prog.uniLocations["u_amount"], amount);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.drawElements(gl.POINTS, this.count, gl.UNSIGNED_SHORT, 0);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var tmp = this.pos;
    this.pos = this.newPos;
    this.newPos = tmp;
};

Breed.prototype.turn = function(gl, amount) {
    var prog = programs['turn'];
    if (!framebuffer) {
	framebuffer = gl.createFramebuffer();
	initFramebuffer(gl, framebuffer, this.newPos, gl.FLOAT);
    } else {
	setTargetBuffer(gl, framebuffer, this.newPos);
    }

    gl.useProgram(prog.program);
    VAOExt.bindVertexArrayOES(prog.vao);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesIBO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.viewport(0, 0, T, T);

    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_position"], 0);
    var cos = Math.cos(amount);
    var sin = Math.sin(amount);

    gl.uniformMatrix2fv(prog.uniLocations["u_rot"], false, [cos, sin, -sin, cos]);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.drawElements(gl.POINTS, this.count, gl.UNSIGNED_SHORT, 0);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var tmp = this.pos;
    this.pos = this.newPos;
    this.newPos = tmp;
};

Breed.prototype.setPatch = function(gl, patch, value) {
    var prog = programs['setPatch'];
    if (!framebuffer) {
	framebuffer = gl.createFramebuffer();
	initFramebuffer(gl, framebuffer, patch.values, gl.FLOAT, FW, FH);
    } else {
	setTargetBuffer(gl, framebuffer, patch.values);
    }

    gl.useProgram(prog.program);
    VAOExt.bindVertexArrayOES(prog.vao);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesIBO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.viewport(0, 0, FW, FH);

    gl.uniform2f(prog.uniLocations["u_resolution"], gl.canvas.width, gl.canvas.height);
    gl.uniform1f(prog.uniLocations["u_particleLength"], T);
    gl.uniform1i(prog.uniLocations["u_position"], 0);
    gl.uniform4fv(prog.uniLocations["u_value"], value);
    gl.uniform1i(prog.uniLocations["u_type"], patch.type);

    gl.drawElements(gl.POINTS, this.count, gl.UNSIGNED_SHORT, 0);
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

Patch.prototype.draw = function(gl) {
    var prog = programs['drawPatch'];

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(prog.program);
    VAOExt.bindVertexArrayOES(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.values);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.uniform1i(prog.uniLocations['u_value'], 0);
    gl.uniform1i(prog.uniLocations['u_type'], this.type);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.flush();
};


Patch.prototype.diffuse = function(gl) {
    var prog = programs['diffusePatch'];

    if (!framebuffer) {
	framebuffer = gl.createFramebuffer();
	initFramebuffer(gl, framebuffer, this.newValues, gl.FLOAT);
    } else {
	setTargetBuffer(gl, framebuffer, this.newValues);
    }

    gl.useProgram(prog.program);
    VAOExt.bindVertexArrayOES(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.values);

    gl.viewport(0, 0, FW, FH);

    gl.uniform1i(prog.uniLocations['u_value'], 0);
    gl.uniform2f(prog.uniLocations["u_resolution"], FW, FH);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.flush();

    var tmp = this.newValues;
    this.newValues = this.values;
    this.values = tmp;
};


function debugDisplay1(gl, breed) {
    debugArray = new Uint8Array(T * T * 4);
    setTargetBuffer(gl, framebuffer, breed.pos);
    gl.readPixels(0, 0, T, T, gl.RGBA, gl.UNSIGNED_BYTE, debugArray);
    var img = new ImageData(new Uint8ClampedArray(debugArray.buffer), T, T);
    debugCanvas1.getContext('2d').putImageData(img, 0, 0);
};

