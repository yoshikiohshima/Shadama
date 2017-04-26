"use strict";

var g;
var s;

function initCompiler() {
    g = ohm.grammarFromScriptElement();
    s = g.createSemantics();
    initSemantics();
};

function initSemantics() {
    s.addOperation(
	"symTable", 
	{
	    TopLevel: function(ds) {
		var result = {};
		for (var i = 0; i< ds.children.length; i++) {
		    var d = ds.children[i].symTable();
		    debugArray = (ds.children[i]);
		    var n = ds.children[i].children[3].sourceString;
		    result[n] = d;
		}
		return result;
	    },
	    
	    Script: function(_d, _b, _p, _n, _o, ns, _c, b) {
		debugArray = ns;
		var c = b.symTable();
		addAsSet(c, ns.symTable());
		return c;
	    },
	    
	    Formals_list: function(h, _c, r) {
		var c = {["param." + h.sourceString]: ["param", null, h.sourceString]};
		for (var i = 0; i < r.children.length; i++) {
		    var n = r.children[i].sourceString;
		    c["param." + n] = ["param", null, n];
		}
		return c;
	    },
	    
	    StatementList: function(ss) { // an iter
		var result = {};
		for (var i = 0; i< ss.children.length; i++) {
		    var s = ss.children[i].symTable();
		    addAsSet(result, s);
		}
		return result;
	    },

	    VariableDeclaration: function(n, _optI) {
		return {["var." + n.sourceString]: ["var", null, n.sourceString]};
	    },
	    
	    IfStatement: function(_if, _o, c, _c, t, _e, optF) {
		var r = c.symTable();
		addAsSet(r, t.symTable());
		addAsSet(r, optF.symTable()[0]);
		return r;
	    },
	    LeftHandSideExpression_field: function(n, _a, f) {
		return {["out." + n.sourceString + "." + f.sourceString]: ["propOut", n.sourceString, f.sourceString]};
	    },
	    PrimExpression_field: function(n, _p, f) {
		return {["in." + n.sourceString + "." + f.sourceString]: ["propIn", n.sourceString, f.sourceString]};
	    },
	    PrimExpression_variable: function(n) {
		return {["var." + n.sourceString]: ["var", null, n.sourceString]};
	    },

	    PrimitiveCall: function(n, _o, as, _c) {
		if (n.sourceString == "forward") {
		    var c = {
			"out.this.x": ["propOut", "this", "x"],
			"out.this.y": ["propOut", "this", "y"],
			"out.this.dx": ["propOut", "this", "dx"],
			"out.this.dy": ["propOut", "this", "dy"],
			"in.this.x": ["propIn", "this", "x"],
			"in.this.y": ["propIn", "this", "y"],
			"in.this.dx": ["propIn", "this", "dx"],
			"in.this.dy": ["propIn", "this", "dy"]};
		    

		} else {
		    c = {};
		}
		addAsSet(c, as.symTable());
		return c;
	    },

	    Actuals_list: function(h, _c, r) {
		var c = h.symTable();
		for (var i = 0; i < r.children.length; i++) {
		    addAsSet(c, r.children[i].symTable());
		}
		return c;
	    },

	    ident: function(_h, _r) {return {};},
	    number: function(s) {return {};},
	    _terminal: function() {return {};},
	    _nonterminal: function(children) {
		var result = {};
		for (var i = 0; i < children.length; i++) {
		    addAsSet(result, children[i].symTable());
		}
		return result;
	    },
	});

    function transBinOp(l, r, op, args) {
	var table = args.table;
	var vert = args.vert;
	var frag = args.frag;
	l.glsl(table, vert, frag);
	vert.push(op);
	r.glsl(table, vert, frag);
    };

    s.addOperation(
        "glsl(table, vert, frag)",
        {
	    Script: function(_d, _b, _p, n, _o, ns, _c, b) {
		var table = this.args.table;
		var vert = this.args.vert;
		var frag = this.args.frag;

		vert.push("#version 300 es\n");

		vert.push("layout (location = 0) in vec2 a_index;\n");
		vert.push("uniform vec2 u_resolution;\n");
		vert.push("uniform float u_particleLength;\n");

		table.uniforms().forEach(function(elem) {
		    vert.push(elem);
		    vert.push("\n");
		});
		vert.crIfNeeded();
		table.vertVaryings().forEach(function(elem) {
		    vert.push(elem);
		    vert.push("\n");
		});
		vert.crIfNeeded();
		vert.push("void");
		//vert.pushWithSpace(n.sourceString);
		vert.pushWithSpace("main");
		vert.push("()");

		// fragment head

		frag.push("#version 300 es\n");
		frag.push("precision highp float;\n");

		table.fragVaryings().forEach(function(elem) {
		    frag.push(elem);
		    frag.push("\n");
		});

		table.outs().forEach(function(elem) {
		    frag.push(elem);
		    frag.push("\n");
		});

		frag.crIfNeeded();
		frag.push("void");
		frag.pushWithSpace("main");
		frag.push("()");

		b.glsl(table, vert, frag);

		vert.crIfNeeded();
		vert.tab();

		frag.pushWithSpace("{\n");

		frag.addTab();
		table.fragColors().forEach(function(line) {
		    frag.tab();
		    frag.push(line);
		    frag.cr();
		});
		frag.decTab();
		frag.crIfNeeded();
		frag.push("}");
		frag.cr();
	    },

	    Block: function(_o, ss, _c) {
		var table = this.args.table;
		var vert = this.args.vert;
		var frag = this.args.frag;
		vert.pushWithSpace("{\n");
		vert.addTab();
		ss.glsl(table, vert, frag);
		vert.decTab();
		vert.tab();
		vert.push("}");
	    },

	    ScriptBlock: function(_o, ss, _c) {
		var table = this.args.table;
		var vert = this.args.vert;
		var frag = this.args.frag;
		vert.pushWithSpace("{\n");
		vert.addTab();
		vert.tab();
		vert.push("vec2 oneToOne = (a_index / u_particleLength) * 2.0 - 1.0;\n");

		ss.glsl(table, vert, frag);
		vert.tab();
		vert.push("gl_Position = vec4(oneToOne, 0, 1.0);\n");
		vert.tab();
		vert.push("gl_PointSize = 1.0;\n");
		vert.decTab();
		vert.tab();
		vert.push("}");
	    },

	    StatementList: function(ss) {
		var table = this.args.table;
		var vert = this.args.vert;
		var frag = this.args.frag;
		for (var i = 0; i < ss.children.length; i++) {
		    vert.tab();
		    ss.children[i].glsl(table, vert, frag);
		    vert.cr();
		}
	    },

	    Statement: function(e) {
		e.glsl(this.args.table, this.args.vert, this.args.frag);
		this.args.vert.push(";");
	    },

	    IfStatement: function(_i, _o, c, _c, t, _e, optF) {
		var table = this.args.table;
		var vert = this.args.vert;
		var frag = this.args.frag;
		vert.push("if");
		vert.pushWithSpace("(");
		c.glsl(table, vert, frag);
		vert.push(")");
		t.glsl(table, vert, frag);
		if (optF.children.length === 0) { return;}
		vert.pushWithSpace("else");
		optF.glsl(table, vert, frag);
	    },
	    AssignmentStatement: function(l, _a, e, _) {
		var table = this.args.table;
		var vert = this.args.vert;
		var frag = this.args.frag;
		l.glsl(table, vert, frag);
		vert.push(" = ");
		e.glsl(table, vert, frag);
	    },
	    
	    LeftHandSideExpression_field: function(n, _p, f) {
		var table = this.args.table;
		var vert = this.args.vert;
		var frag = this.args.frag;
		vert.push(table.varying(["propOut", n.sourceString, f.sourceString]));
	    },

	    Expression: function(e) {
		e.glsl(this.args.table, this.args.vert, this.args.frag);
	    },

	    EqualityExpression: function(e) {
		e.glsl(this.args.table, this.args.vert, this.args.frag);
	    },

	    EqualityExpression_equal: function(l, _, r) {
		transBinOp(l, r, " == ", this.args);
	    },
	    EqualityExpression_notEqual: function(l, _, r) {
		transBinOp(l, r, " != ", this.args);
	    },

	    RelationalExpression: function(e) {
		e.glsl(this.args.table, this.args.vert, this.args.frag);
	    },
	    RelationalExpression_lt: function(l, _, r) {
		transBinOp(l, r, " < ", this.args);
	    },
	    RelationalExpression_gt: function(l, _, r) {
		transBinOp(l, r, " > ", this.args);
	    },
	    RelationalExpression_le: function(l, _, r) {
		transBinOp(l, r, " <= ", this.args);
	    },
	    
	    RelationalExpression_ge: function(l, _, r) {
		transBinOp(l, r, " >= ", this.args);
	    },

	    AddExpression: function(e) {
		e.glsl(this.args.table, this.args.vert, this.args.frag);
	    },

	    AddExpression_plus: function(l, _, r) {
		transBinOp(l, r, " + ", this.args);
	    },

	    AddExpression_minus: function(l, _, r) {
		transBinOp(l, r, " - ", this.args);
	    },

	    MulExpression: function(e) {
		e.glsl(this.args.table, this.args.vert, this.args.frag);
	    },

	    MulExpression_times: function(l, _, r) {
		transBinOp(l, r, " * ", this.args);
	    },

	    MulExpression_divide: function(l, _, r) {
		transBinOp(l, r, " / ", this.args);
	    },

	    PrimExpression: function(e) {
		e.glsl(this.args.table, this.args.vert, this.args.frag);
	    },

	    PrimExpression_paren: function(_o, e, _c) {
		e.glsl(this.args.table, this.args.vert, this.args.frag);
	    },

	    PrimExpression_number: function(e) {
		var table = this.args.table;
		var vert = this.args.vert;
		var frag = this.args.frag;
		vert.push(e.sourceString);
	    },

	    PrimExpression_field: function(n, _p, f) {
 		var table = this.args.table;
 		var vert = this.args.vert;
 		var frag = this.args.frag;

		if (table.isAttribute(n.sourceString)) {
		    vert.push(n.sourceString);
		    vert.push(".");
		    vert.push(f.sourceString);
		} else {
		    vert.push("texelFetch(" +
			      table.in(["propIn", n.sourceString, f.sourceString]) +
			      ", ivec2(a_index), 0).r");
		}
 	    },

	    PrimExpression_variable: function(n) {
 		var table = this.args.table;
 		var vert = this.args.vert;
 		var frag = this.args.frag;

		vert.push(n.sourceString);
	    },

	    PrimitiveCall: function(n, _o, as, _c) {
		var table = this.args.table;
		var vert = this.args.vert;
		var frag = this.args.frag;
		vert.push(n.sourceString);
		vert.push("(");
		as.glsl(table, vert, frag);
		vert.push(")");
	    },

	    Actuals_list: function(h, _c, r) {
		var table = this.args.table;
		var vert = this.args.vert;
		var frag = this.args.frag;
		h.glsl(table, vert, frag);
		for (var i = 0; i < r.children.length; i++) {
		    vert.push(", ");
		    r.children[i].glsl(table, vert, frag);
		}
	    },
	});
};

function SymTable(table, defaultUniforms, defaultAttributes) {
    this.rawTable = table;
    this.uniformTable = {};
    this.varyingTable = {};
    this.outTable = {};

    this.defaultUniforms = [];
    this.defaultAttributes = [];

    if (defaultUniforms) {
	this.defaultUniforms = defaultUniforms;
    }
    if (defaultAttributes) {
	this.defaultAttributes = defaultAttributes;
    }

    for (var k in table) {
	var entry = table[k];
	if (entry[0] === "propOut" && entry[1] === "this") {
	    this.varyingTable[entry[2]] = "v_this_" + entry[2];
	    this.outTable[entry[2]] = "o_this_" + entry[2];
	} else if (entry[0] === "propIn" && entry[1] === "this") {
	    this.uniformTable[entry[2]] = "u_this_" + entry[2];
	}
    }
};


SymTable.prototype.varying = function(entry) {
    return this.varyingTable[entry[2]];
};

SymTable.prototype.in = function(entry) {
    return this.uniformTable[entry[2]];
};

SymTable.prototype.out = function(entry) {
    return this.outTable[entry[2]];
};

SymTable.prototype.uniforms = function() {
    var result = [];
    for (var k in this.uniformTable) {
	result.push("uniform sampler2D " + this.uniformTable[k] + ";");
    }
    return result;
};
	    
SymTable.prototype.vertVaryings = function() {
    var result = [];
    for (var k in this.varyingTable) {
	result.push("out float " + this.varyingTable[k] + ";");
    }
    return result;
};
	    
SymTable.prototype.fragVaryings = function() {
    var result = [];
    for (var k in this.varyingTable) {
	result.push("in float " + this.varyingTable[k] + ";");
    }
    return result;
};

SymTable.prototype.outs = function() {
    var that = this;
    return Object.keys(this.outTable).map(function(k) {
	return "out float " + that.outTable[k] + ";";
    });
};

SymTable.prototype.fragColors = function() {
    var result = [];
    var keys = Object.keys(this.varyingTable);
    for (var i = 0; i < keys.length; i++) {
	result.push(this.outTable[keys[i]] + " = " + this.varyingTable[keys[i]] + ";");
    }
    return result;
};

SymTable.prototype.isAttribute = function(n) {
    return this.defaultAttributes.indexOf(n) >= 0;
};

function CodeStream() {
    this.result = [];
    this.hadCR = true;
    this.hadSpace = true;
    this.tabLevel = 0;
};

CodeStream.prototype.addTab = function() {
    this.tabLevel++;
};

CodeStream.prototype.decTab = function() {
    this.tabLevel--;
};

CodeStream.prototype.cr = function() {
    this.result.push("\n");
    this.hadCR = true;
};

CodeStream.prototype.tab = function() {
    for (var i = 0; i < this.tabLevel; i++) {
	this.result.push("  ");
    }
};

CodeStream.prototype.skipSpace = function() {
    this.hadSpace = true;
};

CodeStream.prototype.crIfNeeded = function() {
    if (!this.hadCR) {
	this.cr();
    }
};

CodeStream.prototype.push = function(val) {
    this.result.push(val);
    var last = val[val.length - 1];
    this.hadSpace = (last === " " || last == "\n" || last == "{" || last == "(");
    this.hadCR = last == "\n";
};

CodeStream.prototype.pushWithSpace = function(val) {
    if (!this.hadSpace) {
	this.push(" ");
    }
    this.push(val);
};

CodeStream.prototype.contents = function() {
    function flatten(ary) {
	return ary.reduce(function (a, b) {
	    return a.concat(Array.isArray(b) ? flatten(b) : b)}, []).join("");
    };
    return flatten(this.result);
};

function parse(aString, optRule) {
    var rule = optRule;
    if (!rule) {
	rule = "TopLevel";
    }
    return g.match(aString, rule);
};

function grammarTest(aString, rule, ctor) {
    var match = parse(aString, rule);

    if (!match.succeeded()) {
	console.log(aString);
        console.log("did not parse: " + aString);
    }
    if (!ctor) {
	ctor = rule;
    }
    if (match._cst.ctorName != ctor) {
	console.log(str);
        console.log("did not get " + ctor + " from " + aString);
    }
};

function addAsSet(to, from) {
    for (var k in from) {
	if (from.hasOwnProperty(k)) {
	    to[k] = from[k];
	}
    }
    return to;
};

function semanticsTest(str, prod, sem, attr, expected) {
    function stringify(obj) {
	var type = Object.prototype.toString.call(obj);
	
	// IE8 <= 8 does not have array map
	var map = Array.prototype.map || function map(callback) {
	    var ret = [];
	    for (var i = 0; i < this.length; i++) {
		ret.push(callback(this[i]));
	    }
	    return ret;
	};
	
	if (type === "[object Object]") {
	    var pairs = [];
	    for (var k in obj) {
		if (!obj.hasOwnProperty(k)) continue;
		pairs.push([k, stringify(obj[k])]);
	    }
	    pairs.sort(function(a, b) { return a[0] < b[0] ? -1 : 1 });
	    pairs = map.call(pairs, function(v) { return '"' + v[0] + '":' + v[1] });
	    return "{" + pairs + "}";
	}
	
	if (type === "[object Array]") {
	    return "[" + map.call(obj, function(v) { return stringify(v) }) + "]";
	}
	
	return JSON.stringify(obj);
    };


    var match = parse(str, prod);
    if (!match.succeeded()) {
	console.log(str);
        console.log("did not parse: " + str);
    }
    
    var n = sem(match);
    var result = n[attr].call(n);
    var ja = stringify(result);
    var jb = stringify(expected);
    if (ja != jb) {
	console.log(str);
        console.log("rule: " + attr + " expected: " + jb + " got: " + ja);
    }
};

function translate(str, prod, defaultUniforms, defaultAttributes) {
    var match = parse(str, prod);
    if (!match.succeeded()) {
	console.log(str);
        console.log("did not parse: " + str);
    }

    var n = s(match);
    var rawTable = n.symTable();

    var d = defaultUniforms ? defaultUniforms : ["u_particleLength", "u_resolution"];
    var a = defaultAttributes ? defaultAttributes : ["a_index"];
    // u_resolution only needed when the code has patches.  And for patches, they'd be something else

    var table = new SymTable(rawTable, d, a);
    var vert = new CodeStream();
    var frag = new CodeStream();
    
    n.glsl(table, vert, frag);
    
    console.log(vert.contents());
    console.log(frag.contents());
    
    return [table, vert, frag];
};
