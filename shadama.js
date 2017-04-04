var TEXTURE_SIZE = 256;
var FIELD_SIZE = 512;

var T = TEXTURE_SIZE;
var F = FIELD_SIZE;

var T2 = TEXTURE_SIZE * TEXTURE_SIZE;
var F2 = FIELD_SIZE * FIELD_SIZE;

var src;
var dst;

var debugCanvas1;
var debugCanvas2;

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

var frames;
var diffTime;


function initIndices(gl) {
    allIndices = new Array(T2);
    for (var i = 0; i < T2; i++) {
	allIndices[i] = i;
    }

    vertices = new Array(T2 * 2);
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

function createTexture(gl, data, format) {
    if (!format) {
	format = gl.UNSIGNED_BYTE;
    }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    
    if (format != gl.UNSIGNED_BYTE) {
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, T, T, 0, gl.RGBA, format, data);
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

function initFramebuffer(gl, buffer, tex, format) {
    if (!format) {
	format = gl.UNSIGNED_BYTE;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, T, T, 0, gl.RGBA, format, null);
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

    var ary = new Float32Array(T2*4);
    for (var j = 0; j < T; j++) {
	for (var i = 0; i < T; i++) {
	    var ind = (j * T + i) * 4;
	    var r = randomDirection();
	    ary[ind + 0] = (a+= 4);
	    ary[ind + 1] = j;
	    ary[ind + 2] = r[0];
	    ary[ind + 3] = r[1];
	}
    }
    this.pos = createTexture(gl, ary, gl.FLOAT);

    ary = new Float32Array(T2*4);
    this.newPos = createTexture(gl, ary, gl.FLOAT);

    ary = new Uint8ClampedArray(T2*4);
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

function step() {
    frames++;
    var sTime = Date.now();

    myBreed.render(gl);
    myBreed.forward(gl, 1.0);

    diffTime += (Date.now() - sTime);
    if (frames % 60 === 0) {
	readout.innerHTML = 'msecs/frame: ' + (diffTime / 60.0);
	diffTime = 0;
    }

    window.requestAnimationFrame(step);
}

onload = function() {
    debugCanvas1 = document.getElementById('debugCanvas1');
    debugCanvas1.width = F;
    debugCanvas1.height = F;

    debugCanvas2 = document.getElementById('debugCanvas2');
    debugCanvas2.width = F;
    debugCanvas2.height = F;

    readout = document.getElementById('readout');

    var c = document.getElementById('canvas');
    c.width = F;
    c.height = F;
    
    gl = c.getContext('webgl'); 

    VAOExt = gl.getExtension('OES_vertex_array_object');

    floatExt = gl.getExtension('OES_texture_float');
    if (!floatExt) {
	alert('float texture not supported');
	return;
    }

    programs['renderBreed'] = renderBreedProgram(gl);
    programs['forward'] = forwardProgram(gl);

    myBreed = new Breed(gl, 32768);

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

function renderBreedProgram(gl) {
    var vs = createShader(gl, 'renderBreed.vert');
    var fs = createShader(gl, 'renderBreed.frag');
    
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

Breed.prototype.render = function(gl) {
    var prog = programs['renderBreed'];
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

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

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
//    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var tmp = this.pos;
    this.pos = this.newPos;
    this.newPos = tmp;
};

function debugDisplay1(gl, breed) {
    debugArray = new Uint8Array(256*256*4);
    setTargetBuffer(gl, framebuffer, breed.pos);
    gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, debugArray);
    var img = new ImageData(new Uint8ClampedArray(debugArray.buffer), 256, 256);
    debugCanvas1.getContext('2d').putImageData(img, 0, 0);
};

function debugDisplay2(gl, breed) {
    debugArray = new Uint8Array(256*256*4);
    setTargetBuffer(gl, framebuffer, breed.newPos);
    gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, debugArray);
    var img = new ImageData(new Uint8ClampedArray(debugArray.buffer), 256, 256);
    debugCanvas2.getContext('2d').putImageData(img, 0, 0);
};
