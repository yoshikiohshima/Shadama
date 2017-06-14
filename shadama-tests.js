"use strict";

function assert(result, expected, str) {
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

    var a = stringify(result);
    var b = stringify(expected);
    if (a != b) {
        console.log("Expected: " + b + " got: " + a + " called from ");
	console.log(new Error("assertion failed").stack);
    }
    return a != b;
}

function setTestParams() {
//    TEXTURE_SIZE = 16;
//    FIELD_WIDTH = 32;
//    FIELD_HEIGHT = 32;
    
//    T = TEXTURE_SIZE;
//    FW = FIELD_WIDTH;
//    FH = FIELD_HEIGHT;
}

function setUp() {
    var ary = ["x", "y", "dx", "dy", "r", "g", "b", "a"];
    update(Breed, "Breed1", ary);
    update(Patch, "Patch1", ary);
    env["Breed1"].setCount(10);
}

// function test() {
//     setUp();
//     test1();
//     test2();
//     test3();
//     test4();
//     test6();
// }

function test() {
    directTest();
}


function directTest() {
    setUp();
    var r = env["Breed1"];
    r.fillSpace("x", "y", FW, FH);
    
    var count = 0;
    var f = function() {
	for (var i = 0; i < 10; i++) {
	    console.log("debugFrame()");
	    r.debugFrame();
	}
	r.draw();
	if (count < 100) {
	    requestAnimationFrame(f);
	    count++;
	    
	}
    }
    f();
}


function test1() {
    var obj = env["Breed1"];
    for (var k in obj.own) {
	var elem = obj.own[k];
	assert(obj[elem].constructor, WebGLTexture);
	assert(obj["new"+elem].constructor, WebGLTexture);
    }
}

function caller(scriptName, thisName, bindings, inParams) {
    (function() {
	var data = scripts[scriptName];
	var func = data[0];
	var ins = data[1][0]; // [[name, <fieldName>]]
	var formals = data[1][1];
	var outs = data[1][2]; //[[object, <fieldName>]]
	var objects = {};
	objects.this = env[thisName];
	objects = addAsSet(objects, bindings);
	var params = inParams || {};
	func(objects, outs, ins, params);
    })();
}


function test2() {
   var source = `
def set() {
  this.x = 1.0;
  this.y = 0.0;
  this.dx = 1.0;
  this.dy = 1.0;
  this.r = 1.0;
  this.g = 0.0;
  this.b = 1.0;
  this.a = 1.0;
}

def setColor() {
  this.r = 1.0;
  this.g = 0.0;
  this.b = 1.0;
  this.a = 1.0;
}

def clear(patch) {
  patch.x = 1.0;
  patch.y = 1.0;
  patch.dx = 1.0;
  patch.dy = 1.0;
}

def move() {
  var dx = this.dx;
  var dy = this.dy - 0.01;
  this.x = this.x + dy;
  this.y = this.y + dy;
}
`;

    loadShadama(null, source);
    caller("set", "Breed1", {});
    debugDisplay("Breed1", "x");
    assert(debugArray1[0], 1);
    assert(debugArray1[10], 0);
}

function test3() {
    env["Breed1"].fillSpace("x", "y", FW, FH);
    debugDisplay("Breed1", "x");
    assert(debugArray1[0], 0);
    assert(debugArray1[9], 9);
    assert(debugArray1[10], 10);
    assert(debugArray1[FW-1], FW-1);
    assert(debugArray1[FW], 0);

    debugDisplay("Breed1", "y");
    assert(debugArray1[0], 0);
    assert(debugArray1[9], 0);
    assert(debugArray1[10], 0);
    assert(debugArray1[FW-1], 0);
    assert(debugArray1[FW], 1);
}

function test4() {
    var obj = env["Breed1"];
    env["Breed1"].fillSpace("x", "y", FW, FH);
    debugDisplay("Breed1", "newx");
    var old = debugArray1.slice();
    textureCopy(obj, obj["x"], obj["new"+"x"]);
    debugDisplay("Breed1", "newx");
    var now = debugArray1.slice();
    assert(old[10], 10);  // because updateOwnVariable resets both new and old
    assert(now[10], 10);
}

function test5() {
    var b = env["Patch1"];
    var r = env["Breed1"];
    var count = 0;
    var f = function () {
	for (var i = 0; i < 10; i++) {
	    console.log("test5()");
	    textureCopy(b, b["x"], b["new"+"x"]);
	    textureCopy(r, r["x"], r["new"+"x"]);
	    textureCopy(b, b["y"], b["new"+"y"]);
	    textureCopy(r, r["y"], r["new"+"y"]);
	    textureCopy(b, b["dx"], b["new"+"dx"]);
	    textureCopy(r, r["dx"], r["new"+"dx"]);
	    textureCopy(b, b["dy"], b["new"+"dy"]);
	    textureCopy(r, r["dy"], r["new"+"dy"]);
	}
	if (count < 100) {
	    requestAnimationFrame(f);
	    count++;
	}
    }
    f();
}

function test6() {
    var b = env["Patch1"];
    var r = env["Breed1"];
    env["Breed1"].fillSpace("x", "y", FW, FH);
    var count = 0;
    var f = function() {
	for (var i = 0; i < 10; i++) {
	    console.log("test6()");
	    caller("setColor", "Breed1", {});
	}
	r.draw();
	if (count < 100) {
	    requestAnimationFrame(f);
	    count++;
	    
	}
    }
    f();
}
