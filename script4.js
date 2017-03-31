var src;
var dst;

var debugCanvas1;
var debugCanvas2;

var debugArray;

var gl;
var framebuffer;

function createShader(gl, type, id) {
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

function useFramebuffer(gl, buffer, tex, active) {
    gl.activeTexture(active);
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

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

function render(image, destImage) {
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
	
    var vertexShader = createShader(gl, gl.VERTEX_SHADER, "s3.vert");
    var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, "s3.frag");
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

    var vertices = new Array(65536*2);
    for (var j = 0; j < 256; j++) {
	for (i = 0; i < 256; i++) {
	    var ind = (j * 256 + i) * 2;
	    vertices[ind + 0] = j;
	    vertices[ind + 1] = i;
	}
    }

//    var ibo = createIBO(gl, indices);

    
    var positionBuffer = gl.createBuffer();
//    var texCoordBuffer = gl.createBuffer();

    set_buffer_attribute(gl,
			 [positionBuffer],
			 [
		     [0,   0,
		      256, 0,
		      0, 256,
		      0, 256,
		      256, 0,
		      256, 256],


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

    useFramebuffer(gl, framebuffer, destTexture, gl.TEXTURE1);


//    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Clear the canvas
    gl.clearColor(0, 0.2, 0.2, 0.2);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Tell it to use our program (pair of shaders)
    gl.useProgram(program);

    // Bind the attribute/buffer set we want.
    gl.bindVertexArray(vao);

//    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);

    gl.uniform2f(uniLocations["u_resolution"], gl.canvas.width, gl.canvas.height);
    gl.uniform1i(uniLocations["u_image"], 0);

//    gl.drawElements(gl.TRIANGLES, 20000, gl.UNSIGNED_SHORT, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.flush();
};

function debugDisplay(gl) {
    debugArray = new Uint8Array(256*256*4);

    gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, debugArray);
    var img = new ImageData(new Uint8ClampedArray(debugArray.buffer), 256, 256);
    debugCanvas1.getContext('2d').putImageData(img, 0, 0);
}


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

onload = function () {
    src = makePos();
    dst = makeDest();
    render(src, dst);
}
