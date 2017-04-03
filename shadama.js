var src;
var dst;

var debugCanvas1;
var debugCanvas2;

var debugArray;

var gl;
var framebuffer;

var programs = {};

var allIndices;
var vertices;
var indicesIBO;

var myBreed;

function initIndices(gl) {
    allIndices = new Array(65536);
    for (var i = 0; i < 65536; i++) {
	allIndices[i] = i;
    }

    vertices = new Array(65536 * 2);
    for (var j = 0; j < 256; j++) {
	for (i = 0; i < 256; i++) {
	    var ind = (j * 256 + i) * 2;
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

function createTexture(gl, imageData) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
			
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
			
//    gl.generateMipmap(gl.TEXTURE_2D);
			
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
};


function initFramebuffer(gl, buffer, tex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    gl.bindTexture(gl.TEXTURE_2D, null);
}

function setTargetBuffer(gl, buffer, tex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
}

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
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Int16Array(data), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return ibo;
};

function randomDirection() {
  return encodeOne24(Math.random());
};

function encodeOne24(value) {
  var v = Math.floor(value * 0x1000000);
  return [(v & 0xFF0000) >> 16, (v & 0xFF00) >> 8, v & 0xFF];
};

function Breed(gl, count, color) {
    var imageData;

    var ary = new Uint8ClampedArray(256*256*4);
    for (var j = 0; j < 256; j++) {
	for (var i = 0; i < 256; i++) {
	    var ind = (j * 256 + i) * 4;
	    ary[ind + 0] = i;
	    ary[ind + 1] = 0;
	    ary[ind + 2] = j;
	    ary[ind + 3] = 0;
	}
    }
    imageData = new ImageData(ary, 256, 256);

    this.pos = createTexture(gl, imageData);

    imageData = new ImageData(ary, 256, 256);
    this.newPos = createTexture(gl, imageData);

    var ary = new Uint8ClampedArray(256*256*4);
    for (var i = 0; i < 256 * 256; i++) {
	var d = randomDirection();
	var ind = i * 4;
	ary[ind + 0] = d[0];
	ary[ind + 1] = d[1];
	ary[ind + 2] = d[2];
    }

    imageData = new ImageData(ary, 256, 256);
    this.dir = createTexture(gl, imageData);

    imageData = new ImageData(ary, 256, 256);
    this.newDir = createTexture(gl, imageData);

    this.count = count;
    this.color = color;
};

function step() {
    myBreed.render(gl);
    myBreed.forward(gl, 3.0);
    window.requestAnimationFrame(step);
}

onload = function() {
    debugCanvas1 = document.getElementById('debugCanvas1');
    debugCanvas1.width = 256;
    debugCanvas1.height = 256;

    debugCanvas2 = document.getElementById('debugCanvas2');
    debugCanvas2.width = 256;
    debugCanvas2.height = 256;


    var c = document.getElementById('canvas');
    c.width = 256;
    c.height = 256;
    
    gl = c.getContext('webgl2'); 

    programs['renderBreed'] = renderBreedProgram(gl);
    programs['forward'] = forwardProgram(gl);

    myBreed = new Breed(gl, 32768, [1.0, 0.0, 0.0, 1.0]);

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
    uniLocations['u_position'] = gl.getUniformLocation(prog, 'u_position');
    uniLocations['u_direction'] = gl.getUniformLocation(prog, 'u_direction');
    uniLocations['u_amount'] = gl.getUniformLocation(prog, 'u_amount');
  

    // Create a vertex array object (attribute state)
    var vao = gl.createVertexArray();
    // and make it the one we're currently working with
    gl.bindVertexArray(vao);

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
    uniLocations['u_position'] = gl.getUniformLocation(prog, 'u_position');
    uniLocations['u_color'] = gl.getUniformLocation(prog, 'u_color');

    // Create a vertex array object (attribute state)
    var vao = gl.createVertexArray();
    // and make it the one we're currently working with
    gl.bindVertexArray(vao);

    initIndices(gl);

    var positionBuffer = gl.createBuffer();
    set_buffer_attribute(gl, [positionBuffer], [vertices], attrLocations, attrStrides);

    return {program: prog, attrLocations: attrLocations, attrStrides: attrStrides, uniLocations: uniLocations, vao: vao};
}

Breed.prototype.render = function(gl) {
    var prog = programs['renderBreed'];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.uniform2f(prog.uniLocations["u_resolution"], gl.canvas.width, gl.canvas.height);
    gl.uniform1i(prog.uniLocations['u_position'], 0);
    gl.uniform4fv(prog.uniLocations['u_color'], this.color);

    gl.clearColor(0.0, 1.0, 0.7, 1.0);
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
	initFramebuffer(gl, framebuffer, this.newPos);
    } else {
	setTargetBuffer(gl, framebuffer, this.newPos);
    }

    gl.useProgram(prog.program);
    gl.bindVertexArray(prog.vao);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesIBO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pos);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dir);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.uniform2f(prog.uniLocations["u_resolution"], gl.canvas.width, gl.canvas.height);
    gl.uniform1i(prog.uniLocations["u_position"], 0);
    gl.uniform1i(prog.uniLocations["u_direction"], 1);
    gl.uniform1f(prog.uniLocations["u_amount"], amount);

    gl.clearColor(0.0, 0.7, 0.7, 1.0);
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

function makePos() {
    var ary = new Uint8ClampedArray(256*256*4);
    for (var j = 0; j < 256; j++) {
	for (var i = 0; i < 256; i++) {
	    var ind = (j * 256 + i) * 4;
	    ary[ind + 0] = i;
	    ary[ind + 1] = 0;
	    ary[ind + 2] = j;
	    ary[ind + 3] = 255;
	}
    }
    return new ImageData(ary, 256, 256);
};

function makeDest() {
    var ary = new Uint8ClampedArray(256*256*4);
    return new ImageData(ary, 256, 256);
};

function render(image, destImage) {
    var vertexShader = createShader(gl, gl.VERTEX_SHADER, "copy.vert");
    var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, "copy.frag");
    var program = createProgram(gl, vertexShader, fragmentShader);

    var attrLocations = [];
    attrLocations.push(gl.getAttribLocation(program, "a_position"));
//    attrLocations.push(gl.getAttribLocation(program, "a_texCoord"));

    var uniLocations = {};
    uniLocations["u_resolution"] = gl.getUniformLocation(program, "u_resolution");
    uniLocations["u_image"] = gl.getUniformLocation(program, "u_image");
    uniLocations["u_dest"] = gl.getUniformLocation(program, "u_dest");

    // Create a vertex array object (attribute state)
    var vao = gl.createVertexArray();

    // and make it the one we're currently working with
    gl.bindVertexArray(vao);

    var indices = new Array(65536);
    for (var i = 0; i < 65536; i++) {
	indices[i] = i;
    }

    var vertices = new Array(65536 * 2);
    for (var j = 0; j < 256; j++) {
	for (i = 0; i < 256; i++) {
	    var ind = (j * 256 + i) * 2;
	    vertices[ind + 0] = i;
	    vertices[ind + 1] = j;
	}
    }

    var ibo = createIBO(gl, indices);
    
    var positionBuffer = gl.createBuffer();
//    var texCoordBuffer = gl.createBuffer();

    set_buffer_attribute(gl,
			 [positionBuffer],
			 [vertices
//			     [0, 0, 256, 0, 0, 256,256, 256],
			     //    [0.0,  0.0, 1.0,  0.0, 0.0,  1.0, 1.0,  1.0]
			 ],
			 attrLocations, [2]);

    var texture = gl.createTexture();
    src = texture;

    gl.activeTexture(gl.TEXTURE0);
 
    // Bind it to texture unit 0' 2D bind point
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set the parameters so we don't need mips and so we're not filtering
    // and we don't repeat
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Upload the image into the texture.
    var mipLevel = 0;               // the largest mip
    var internalFormat = gl.RGBA;   // format we want in the texture
    var srcFormat = gl.RGBA;        // format of data we are supplying
    var srcType = gl.UNSIGNED_BYTE  // type of data we are supplying
    gl.texImage2D(gl.TEXTURE_2D,
                  mipLevel,
                  internalFormat,
                  srcFormat,
                  srcType,
                  image);

    var destTexture = gl.createTexture();
    dst = destTexture;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, destTexture);

    framebuffer = gl.createFramebuffer();
    initFramebuffer(gl, framebuffer, destTexture);


//    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Clear the canvas
    gl.clearColor(0, 0.2, 0.2, 0.2);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Tell it to use our program (pair of shaders)
    gl.useProgram(program);

    // Bind the attribute/buffer set we want.
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);

    gl.uniform2f(uniLocations["u_resolution"], gl.canvas.width, gl.canvas.height);
    gl.uniform1i(uniLocations["u_image"], 0);

    gl.drawElements(gl.POINTS, 20000, gl.UNSIGNED_SHORT, 0);
//    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.flush();

};
