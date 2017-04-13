var TEXTURE_SIZE = 512;
var FIELD_WIDTH = 400;
var FIELD_HEIGHT = 300;
var ENLARGE = 2;

var T = TEXTURE_SIZE;
var FW = FIELD_WIDTH;
var FH = FIELD_HEIGHT;

var debugCanvas1;

var debugArray;

var programs = {};

var times = [];

function randomDirection() {
    var r = Math.random();
    var r = r * Math.PI * 2.0;
    return [Math.cos(r), Math.sin(r)];
};

function randomPosition() {
    return [Math.random() * FW, Math.random() * FH];
};

function Breed(count, color) {

    var a = 0;

    this.pos = new Float32Array(T * T * 2);
    for (var j = 0; j < T; j++) {
        for (var i = 0; i < T; i++) {
            var p = randomPosition();
            var ind = (j * T + i) * 2;
            this.pos[ind + 0] = p[0];
            this.pos[ind + 1] = p[1];
        }
    }

    this.newPos = new Float32Array(T * T * 2);

    this.dir = new Float32Array(T * T * 2);
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
    this.color = ary;
};

onload = function() {
    readout = document.getElementById('readout');

    var c = document.getElementById('canvas');
    c.width = FW;
    c.height = FH;
    c.style.width = (FW * ENLARGE) + "px";
    c.style.height = (FH * ENLARGE) + "px";

    myBreed = new Breed(250000);

    window.requestAnimationFrame(runner);

    var code = document.getElementById('code');
    var codeArray = step.toString().split('\n');

    code.innerHTML = codeArray.splice(1, codeArray.length - 2).join('<br>');
};

function clear() {
    var cxt = document.getElementById('canvas').getContext('2d');
    cxt.clearRect(0, 0, FW, FH);
}

Breed.prototype.draw = function() {
    var cxt = document.getElementById('canvas').getContext('2d');

    var imageData = cxt.getImageData(0, 0, FW, FH);
    var dest = imageData.data;

    for (var i = 0; i < this.count; i++) {
        var inX = this.pos[i * 2];
        var inY = this.pos[i * 2 + 1];

        var outBase = Math.floor(inY * FW + inX) * 4;

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

        if (newX > FW) {newX = newX - FW;}
        if (newX < 0.0) {newX = newX + FW;}
        if (newY > FH) {newY = newY - FH;}
        if (newY < 0.0) {newY = newY + FH;}

        this.newPos[i * 2] = newX;
        this.newPos[i * 2 + 1] = newY;
    }

    var tmp = this.pos;
    this.pos = this.newPos;
    this.newPos = tmp;
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

    for (var i = 0; i < 100; i++) {
        myBreed.forward(1.5);
    }
    myBreed.draw();
}
