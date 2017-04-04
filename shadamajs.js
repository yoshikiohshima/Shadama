var TEXTURE_SIZE = 256;
var FIELD_SIZE = 512;

var T = TEXTURE_SIZE;
var F = FIELD_SIZE;

var T2 = TEXTURE_SIZE * TEXTURE_SIZE;
var F2 = FIELD_SIZE * FIELD_SIZE;

var src;
var dst;

var debugCanvas1;

var debugArray;

var programs = {};

var allIndices;
var vertices;
var indicesIBO;

var myBreed;

var frames;
var diffTime;

function randomDirection() {
  var r = Math.random();
  var r = r * Math.PI * 2.0;
  return [Math.cos(r), Math.sin(r)];
};

function Breed(count, color) {

    var a = 0;

    this.pos = new Float32Array(T2 * 2);
    for (var j = 0; j < T; j++) {
	for (var i = 0; i < T; i++) {
	    var ind = (j * T + i) * 2;
	    this.pos[ind + 0] = (a += 4);
	    if (a >= F) {
		a = 0;
	    }
	    this.pos[ind + 1] = j;
	}
    }

    this.newPos = new Float32Array(T2 * 2);

    this.dir = new Float32Array(T2 *2);
    for (var j = 0; j < T; j++) {
	for (var i = 0; i < T; i++) {
	    var ind = (j * T + i) * 2;
	    var d = randomDirection();
	    var ind = (j * T + i) * 2;
	    this.dir[ind + 0] = d[0];
	    this.dir[ind + 1] = d[1];
	}
    }
    this.count = count;

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
    this.color = ary;
};

function step() {
    frames++;
    var sTime = Date.now();

    myBreed.render();
    myBreed.forward(1.0);

    diffTime += (Date.now() - sTime);
    if (frames % 60 === 0) {
	readout.innerHTML = 'msecs/frame: ' + (diffTime / 60.0);
	diffTime = 0;
    }
    window.requestAnimationFrame(step);
}

onload = function() {
    var c = document.getElementById('canvas');
    c.width = F;
    c.height = F;

    readout = document.getElementById('readout');
    
    myBreed = new Breed(32768);

    frames = 0;
    diffTime = 0;
    window.requestAnimationFrame(step);
};

Breed.prototype.render = function() {
    var cxt = document.getElementById('canvas').getContext('2d');

    cxt.clearRect(0, 0, F, F);
    var imageData = cxt.getImageData(0, 0, F, F);
    var dest = imageData.data;

    for (var i = 0; i < this.count; i++) {
	var inX = this.pos[i * 2];
	var inY = this.pos[i * 2 + 1];

	var outBase = Math.floor(inY * F + inX) * 4;

	var colorBase = i * 4;
	
	dest[outBase + 0] = this.color[colorBase + 0];
	dest[outBase + 1] = this.color[colorBase + 1];
	dest[outBase + 2] = this.color[colorBase + 2];
	dest[outBase + 3] = this.color[colorBase + 3];
    }
    cxt.putImageData(imageData, 0, 0);
};

Breed.prototype.forward = function(amount) {
    for (var i = 0; i < this.count; i++) {
	var inX = this.pos[i * 2];
	var inY = this.pos[i * 2 + 1];
	var dirX = this.dir[i * 2];
	var dirY = this.dir[i * 2 + 1];
	
	var newX = inX + (dirX * amount);
	var newY = inY + (dirY * amount);
	
	if (newX > F) {newX = newX - F;}
	if (newX < 0.0) {newX = newX + F;}
	if (newY > F) {newY = newY - F;}
	if (newY < 0.0) {newY = newY + F;}
	
	this.newPos[i * 2] = newX;
	this.newPos[i * 2 + 1] = newY;
    }

    var tmp = this.pos;
    this.pos = this.newPos;
    this.newPos = tmp;
};
