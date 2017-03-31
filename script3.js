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

function set_buffer_attribute(gl, buffers, data, attrL, attrS) {
    for (var i in buffers) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers[i]);
	gl.bufferData(gl.ARRAY_BUFFER,
		      new Float32Array(data[i]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(attrL[i]);
        gl.vertexAttribPointer(attrL[i], attrS[i], gl.FLOAT, false, 0, 0);
    }
};


function render(image) {
    var c = document.getElementById('canvas');
    c.width = 512;
    c.height = 512;
    
    var gl = c.getContext('webgl2'); 
	
    var vertexShader = createShader(gl, gl.VERTEX_SHADER, "s3.vert");
    var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, "s3.frag");
    var program = createProgram(gl, vertexShader, fragmentShader);

    var attrLocations = [];
    attrLocations.push(gl.getAttribLocation(program, "a_position"));
    attrLocations.push(gl.getAttribLocation(program, "a_texCoord"));

    var uniLocations = {};
    uniLocations["u_resolution"] = gl.getUniformLocation(program, "u_resolution");
    uniLocations["u_image"] = gl.getUniformLocation(program, "u_image");

    // Create a vertex array object (attribute state)
    var vao = gl.createVertexArray();

    // and make it the one we're currently working with
    gl.bindVertexArray(vao);
    
    // Create a buffer and put a single pixel space rectangle in
    // it (2 triangles)
    var positionBuffer = gl.createBuffer();
    var texCoordBuffer = gl.createBuffer();

    set_buffer_attribute(gl, 
			 [positionBuffer, texCoordBuffer],
			 [
			     [0,   0,
			      150, 0,
			      0, 100,
			      0, 100,
			      150, 0,
			      150, 100],
			     [
				 0.0,  0.0,
				 1.0,  0.0,
				 0.0,  1.0,
				 0.0,  1.0,
				 1.0,  0.0,
				 1.0,  1.0]],
			 attrLocations, [2, 2]);

    var texture = gl.createTexture();

    gl.activeTexture(gl.TEXTURE0 + 0);
 
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

//    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Clear the canvas
    gl.clearColor(0, 0.2, 0.2, 0.2);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Tell it to use our program (pair of shaders)
    gl.useProgram(program);

    // Bind the attribute/buffer set we want.
    gl.bindVertexArray(vao);

    gl.uniform2f(uniLocations["u_resolution"], gl.canvas.width, gl.canvas.height);
    gl.uniform1i(uniLocations["u_image"], 0);

    var count = 6;
    gl.drawArrays(gl.TRIANGLES, 0, 6);
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

onload = function () {
    render(makePos());
}
