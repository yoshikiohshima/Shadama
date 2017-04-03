var src;
var dst;

var debugCanvas1;
var debugCanvas2;

var debugArray;

var programs = {};

var allIndices;
var vertices;
var indicesIBO;

var myBreed;

var frames;
var diffTime;

function randomDirection() {
  return Math.random() * Math.PI * 2.0;
};

function Breed(count, color) {

    this.pos = new Float32Array(65536 * 2);
    for (var j = 0; j < 256; j++) {
	for (var i = 0; i < 256; i++) {
	    var ind = (j * 256 + i) * 2;
	    this.pos[ind + 0] = i;
	    this.pos[ind + 1] = j;
	}
    }

    this.newPos = new Float32Array(65536 * 2);

    this.dir = new Float32Array(65536);
    for (var i = 0; i < 256 * 256; i++) {
	var d = randomDirection();
	this.dir[i] = d;
    }

    this.count = count;
    this.color = color.map(function(x) {return Math.floor(x * 256);});
};

function step() {
    frames++;
    var sTime = Date.now();

    myBreed.render();
    myBreed.forward(3.0);

    diffTime += (Date.now() - sTime);
    if (frames % 60 === 0) {
	readout.innerHTML = 'msecs/frame: ' + (diffTime / 60.0);
	diffTime = 0;
    }
    window.requestAnimationFrame(step);
}

onload = function() {
    var c = document.getElementById('canvas');
    c.width = 256;
    c.height = 256;

    readout = document.getElementById('readout');
    
    myBreed = new Breed(32768, [1.0, 0.0, 0.0, 1.0]);

    frames = 0;
    diffTime = 0;
    window.requestAnimationFrame(step);
};

Breed.prototype.render = function() {
    var cxt = document.getElementById('canvas').getContext('2d');

    cxt.clearRect(0, 0, 256, 256);
    var imageData = cxt.getImageData(0, 0, 256, 256);
    var dest = imageData.data;

    for (var i = 0; i < this.count; i++) {
	var inX = this.pos[i * 2];
	var inY = this.pos[i * 2 + 1];

	var outBase = Math.floor(inY * 256 + inX) * 4;

//	console.log(inX, inY, outBase);
	
	dest[outBase + 0] = this.color[0];
	dest[outBase + 1] = this.color[1];
	dest[outBase + 2] = this.color[2];
	dest[outBase + 3] = this.color[3];
    }
    cxt.putImageData(imageData, 0, 0);
};

Breed.prototype.forward = function(amount) {
    for (var i = 0; i < this.count; i++) {
	var inX = this.pos[i * 2];
	var inY = this.pos[i * 2 + 1];
	var dir = this.dir[i];
	
	var cos = Math.cos(dir);
	var sin = Math.sin(dir);
	var newX = inX + cos * amount;
	var newY = inY + sin * amount;
	
	if (newX > 256.0) {newX = newX - 256.0;}
	if (newX < 0.0) {newX = newX + 256.0;}
	if (newY > 256.0) {newY = newY - 256.0;}
	if (newY < 0.0) {newY = newY + 256.0;}
	
	this.newPos[i * 2] = newX;
	this.newPos[i * 2 + 1] = newY;
    }

    var tmp = this.pos;
    this.pos = this.newPos;
    this.newPos = tmp;
};
