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
        console.log("Expected: " + b + " got: " + a);
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
    var ary = ["x", "y", "dx", "dy"];
    update(Breed, "Test1", ary);
    myObjects["Test1"].setCount(10);
}

function test() {
    setUp();
    test1();
    test2();
    test3();
    test4();
    test5();
}

function test1() {
    var obj = myObjects["Test1"];
    for (var k in obj.own) {
	var elem = obj.own[k];
	assert(obj[elem].constructor, WebGLTexture);
	assert(obj["new"+elem].constructor, WebGLTexture);
    }
}

function caller(scriptName, thisName, inParams) {
    (function() {
	var data = scripts[scriptName];
	var func = data[0];
	var ins = data[1][0]; // [[name, <fieldName>]]
	var formals = data[1][1];
	var outs = data[1][2]; //[[object, <fieldName>]]
	var objects = {};
	objects.this = myObjects[thisName];
	var params = {};
	func(objects, outs, ins, params);
    })();
}


function test2() {
   var source = `
def set() {
  this.x = 1.0;
  this.y = 1.0;
  this.dx = 1.0;
  this.dy = 1.0;
}
`;

    loadShadama(null, source);
    caller("set", "Test1", {});
    debugDisplay("Test1", "x");
    assert(debugArray1[0], 1);
    assert(debugArray1[10], 0);
}

function test3() {
    myObjects["Test1"].fillSpace("x", "y", FW, FH);
    debugDisplay("Test1", "x");
    assert(debugArray1[0], 0);
    assert(debugArray1[9], 9);
    assert(debugArray1[10], 10);
    assert(debugArray1[FW-1], FW-1);
    assert(debugArray1[FW], 0);

    debugDisplay("Test1", "y");
    assert(debugArray1[0], 0, "y1");
    assert(debugArray1[9], 0, "y2");
    assert(debugArray1[10], 0, "y3");
    assert(debugArray1[FW-1], 0, "y4");
    assert(debugArray1[FW], 1, "y5");
}

function test4() {
    var obj = myObjects["Test1"];
    debugDisplay("Test1", "newx");
    var old = debugArray1.slice();
    textureCopy(obj, obj["x"], obj["new"+"x"]);
    debugDisplay("Test1", "newx");
    var now = debugArray1.slice();
    assert(old[10], 0);
    assert(now[10], 10);
}

function test5() {
    var obj = myObjects["Test1"];
    for (var i = 0; i < 10; i++) {
	textureCopy(obj, obj["x"], obj["new"+"x"]);
	textureCopy(obj, obj["y"], obj["new"+"y"]);
	textureCopy(obj, obj["dx"], obj["new"+"dx"]);
	textureCopy(obj, obj["dy"], obj["new"+"dy"]);
    }
}

