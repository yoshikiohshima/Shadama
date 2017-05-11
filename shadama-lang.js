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
            TopLevel(ds) {
                var result = {};
                for (var i = 0; i< ds.children.length; i++) {
                    var d = ds.children[i].symTable();
                    if (ds.children[i].ctorName == "Script") {
                        addAsSet(result, d);
                    }
                }
                return result;
            },

            Breed(_b, n, _o, fs, _c) {
                return {[n.sourceString]: fs.symTable()};
            },

            Patch(_p, n, _o, fs, _c) {
                return {[n.sourceString]: fs.symTable()};
            },

            Script(_d, _b, _p, n, _o, ns, _c, b) {
                var c = b.symTable();
                addAsSet(c, ns.symTable());
                return {[n.sourceString]: c};
            },

            Formals_list(h, _c, r) {
                var c = {["param." + h.sourceString]: ["param", null, h.sourceString]};
                for (var i = 0; i < r.children.length; i++) {
                    var n = r.children[i].sourceString;
                    c["param." + n] = ["param", null, n];
                }
                return c;
            },

            StatementList(ss) { // an iter
                var result = {};
                for (var i = 0; i< ss.children.length; i++) {
                    var s = ss.children[i].symTable();
                    addAsSet(result, s);
                }
                return result;
            },


            VariableDeclaration(n, optI) {
		var r = {["var." + n.sourceString]: ["var", null, n.sourceString]};
		addAsSet(r, optI.children[0].symTable());
		return r;
	    },

            IfStatement(_if, _o, c, _c, t, _e, optF) {
                var r = c.symTable();
                addAsSet(r, t.symTable());
                addAsSet(r, optF.symTable()[0]);
                return r;
            },
            LeftHandSideExpression_field(n, _a, f) {
		var entry = ["propOut", n.sourceString, f.sourceString];
                return {[entry.join(".")]: entry};
            },
            PrimExpression_field(n, _p, f) {
		var name = n.sourceString;
		if (["u_particleLength", "u_resolution"].indexOf(name) >= 0 ||
		    ["a_index"].indexOf(name) >= 0) {
		    return {};
		}
//                if (table.isBuiltin(n.sourceString)) {
//		    return {};
//		}
		var entry = ["propIn", n.sourceString, f.sourceString];
                return {[entry.join(".")]: entry};
            },
            PrimExpression_variable(n) {
                return {};//["var." + n.sourceString]: ["var", null, n.sourceString]};
            },

            PrimitiveCall(n, _o, as, _c) {
                var c = {};
                addAsSet(c, as.symTable());
                return c;
            },

            Actuals_list(h, _c, r) {
                var c = h.symTable();
                for (var i = 0; i < r.children.length; i++) {
                    addAsSet(c, r.children[i].symTable());
                }
                return c;
            },

            ident(_h, _r) {return {};},
            number(s) {return {};},
            _terminal() {return {};},
            _nonterminal(children) {
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
        var js = args.frag;
	vert.push("(");
        l.glsl(table, vert, frag, js);
        vert.push(op);
        r.glsl(table, vert, frag, js);
	vert.push(")");
    };

    s.addOperation(
        "glsl_script_formals",
        {
            Formals_list(h, _c, r) {
                return [h.sourceString].concat(r.children.map((c) => c.sourceString));
            },
        });

    s.addOperation(
        "glsl_toplevel_block(table, vert, frag, js)",
        {
            Block(_o, ss, _c) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                vert.pushWithSpace("{\n");
                vert.addTab();
                vert.tab();
                vert.push("vec2 oneToOne = (a_index / u_particleLength) * 2.0 - 1.0;\n");

                for (var i = 0; i < table.scalarParamIndex.length; i++) {
                    var k = table.scalarParamIndex[i];
		    var entry = table.scalarParamTable[k];
		    var e = entry[2];
                    var template1 = `float ${e} = u_use_vector_${e} ? texelFetch(u_vector_${e}, ivec2(a_index), 0).r : u_scalar_${e};`;
                    vert.tab();
                    vert.push(template1);
                    vert.cr();
                }

                ss.glsl(table, vert, frag, js);
                vert.tab();
                vert.push("gl_Position = vec4(oneToOne, 0, 1.0);");
                vert.cr();
                vert.tab();
                vert.push("gl_PointSize = 1.0;\n");
                vert.decTab();
                vert.tab();
                vert.push("}");
            },
        });

    s.addOperation(
        "glsl(table, vert, frag, js)",
        {
            TopLevel(ds) {
                var table = this.args.table;
                var result = {};
                //expected to return a list of triples
                for (var i = 0; i < ds.children.length; i++) {
                    var d = ds.children[i];
                    var val = d.glsl(table, null, null, null);
                    addAsSet(result, val);
                };
                return result;
            },

            Breed(_b, n, _o, fs, _c) {
                var table = this.args.table;
                var vert = new CodeStream();
                var frag = new CodeStream();
                var js = [];
                js.push("updateBreed");
                js.push(n.sourceString);
                js.push(fs.glsl_script_formals());
                return {[n.sourceString]: [table[n.sourceString], vert.contents(), frag.contents(), js]};
            },

            Patch(_p, n, _o, fs, _c) {
                var table = this.args.table;
                var vert = new CodeStream();
                var frag = new CodeStream();
                var js = [];
                js.push("updatePatch");
                js.push(n.sourceString);
                js.push(fs.glsl_script_formals());
                return {[n.sourceString]: [table[n.sourceString], vert.contents(), frag.contents(), js]};
            },
            Script(_d, _b, _p, n, _o, ns, _c, b) {
                var inTable = this.args.table;
                var table = inTable[n.sourceString];
                var vert = new CodeStream();
                var frag = new CodeStream();
                var js = [];

                vert.push("#version 300 es\n");
                vert.push("layout (location = 0) in vec2 a_index;\n");
                vert.push("uniform vec2 u_resolution;\n");
                vert.push("uniform float u_particleLength;\n");

                table.uniforms().forEach(elem => {
                    vert.push(elem);
                    vert.cr();
                });

                table.paramUniforms().forEach(elem => {
                    vert.push(elem);
                    vert.cr();
                });

                table.vertVaryings().forEach(elem => {
                    vert.push(elem);
                    vert.cr();
                });

                vert.crIfNeeded();
                vert.push("void");
                vert.pushWithSpace("main");
                vert.push("()");

                // fragment head

                frag.push("#version 300 es\n");
                frag.push("precision highp float;\n");

                table.fragVaryings().forEach((elem) =>{
                    frag.push(elem);
                    frag.cr();
                });

                table.outs().forEach((elem) => {
                    frag.push(elem);
                    frag.cr();
                });

                frag.crIfNeeded();
                frag.push("void");
                frag.pushWithSpace("main");
                frag.push("()");

                b.glsl_toplevel_block(table, vert, frag, js);

                vert.crIfNeeded();
                vert.tab();

                frag.pushWithSpace("{");
		frag.cr();

                frag.addTab();
                table.fragColors().forEach((line) => {
                    frag.tab();
                    frag.push(line);
                    frag.cr();
                });
                frag.decTab();
                frag.crIfNeeded();
                frag.push("}");
                frag.cr();

                js.push("updateScript");
                js.push(n.sourceString);
                return {[n.sourceString]: [table, vert.contents(), frag.contents(), js]};
            },

            Block(_o, ss, _c) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                vert.pushWithSpace("{");
		vert.cr();
                vert.addTab();
                ss.glsl(table, vert, frag, js);
                vert.decTab();
                vert.tab();
                vert.push("}");
            },

            StatementList(ss) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                for (var i = 0; i < ss.children.length; i++) {
                    vert.tab();
                    ss.children[i].glsl(table, vert, frag, js);
                }
            },

            Statement(e) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
		if (e.ctorName !== "Block" && e.ctorName !== "IfStatement") {
                    vert.push(";");
                    vert.cr();
		} 
		if (e.ctorName == "IfStatement") {
                    vert.cr();
		}
            },
            IfStatement(_i, _o, c, _c, t, _e, optF) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                vert.push("if");
                vert.pushWithSpace("(");
                c.glsl(table, vert, frag, js);
                vert.push(")");
                t.glsl(table, vert, frag, js);
                if (optF.children.length === 0) { return;}
                vert.pushWithSpace("else");
                optF.glsl(table, vert, frag, js);
            },
            AssignmentStatement(l, _a, e, _) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                l.glsl(table, vert, frag, js);
                vert.push(" = ");
                e.glsl(table, vert, frag, js);
            },

            VariableStatement(_v, d, _s) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                d.glsl(table, vert, frag, js);
            },

            VariableDeclaration(n, i) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                vert.push("float");
                vert.pushWithSpace(n.sourceString);
                if (i.children.length !== 0) {
                    vert.push(" = ");
                    i.glsl(table, vert, frag, js);
                }
            },

            Initialiser(_a, e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            LeftHandSideExpression_field(n, _p, f) {
                var table = this.args.table;
                var vert = this.args.vert;
                vert.push(table.varying(["propOut", n.sourceString, f.sourceString]));
            },

            Expression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            EqualityExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            EqualityExpression_equal(l, _, r) {
                transBinOp(l, r, " == ", this.args);
            },
            EqualityExpression_notEqual(l, _, r) {
                transBinOp(l, r, " != ", this.args);
            },

            RelationalExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },
            RelationalExpression_lt(l, _, r) {
                transBinOp(l, r, " < ", this.args);
            },
            RelationalExpression_gt(l, _, r) {
                transBinOp(l, r, " > ", this.args);
            },
            RelationalExpression_le(l, _, r) {
                transBinOp(l, r, " <= ", this.args);
            },
            RelationalExpression_ge(l, _, r) {
                transBinOp(l, r, " >= ", this.args);
            },

            AddExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            AddExpression_plus(l, _, r) {
                transBinOp(l, r, " + ", this.args);
            },

            AddExpression_minus(l, _, r) {
                transBinOp(l, r, " - ", this.args);
            },

            MulExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            MulExpression_times(l, _, r) {
                transBinOp(l, r, " * ", this.args);
            },

            MulExpression_divide(l, _, r) {
                transBinOp(l, r, " / ", this.args);
            },

            PrimExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            PrimExpression_paren(_o, e, _c) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            PrimExpression_number(e) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                vert.push(e.sourceString);
            },

            PrimExpression_field(n, _p, f) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;

                if (table.isBuiltin(n.sourceString)) {
                    vert.push(n.sourceString + "." + f.sourceString);
                } else {
                    vert.push("texelFetch(" +
                              table.uniform(["propIn", n.sourceString, f.sourceString]) +
                              ", ivec2(a_index), 0).r");
                }
            },

            PrimExpression_variable(n) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                vert.push(n.sourceString);
            },

            PrimitiveCall(n, _o, as, _c) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                vert.push(n.sourceString);
                vert.push("(");
                as.glsl(table, vert, frag, js);
                vert.push(")");
            },

            Actuals_list(h, _c, r) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                h.glsl(table, vert, frag, js);
                for (var i = 0; i < r.children.length; i++) {
                    vert.push(", ");
                    r.children[i].glsl(table, vert, frag, js);
                }
            },
	    ident(n, rest) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
		vert.push(this.sourceString);
	    }
        });
};

function SymTable(table, defaultUniforms, defaultAttributes) {
    this.rawTable = table;

    this.defaultUniforms = [];
    this.defaultAttributes = [];

    this.thisOutTable = {};   // this.x = ... -> ["propOut", "this", "x"]
    this.thisOutIndex = [];

    this.otherOutTable = {};  // other.x = ... -> ["propOut", "other", "x"]
    this.otherOutIndex = [];

    this.thisInTable = {};    // v = this.x    -> ["propIn", "this", "x"]
    this.thisInIndex = [];    

    this.otherInTable = {};   // v = other.x   -> ["propIn", "other", "x"]
    this.otherInIndex = [];

    this.paramTable = {};     // def foo(a, b, c) -> [["param", null, "a"], ...]
    this.paramIndex = [];

    this.varTable = {};       // var x = ... -> ["var", null, "x"]
    this.varIndex = [];

// ----------------------------

    this.varyingTable = {};   // from prop out
    this.varyingIndex = [];

    this.uniformTable = {};   // from in
    this.uniformIndex = [];

    this.scalarParamTable = {};  // params - other object
    this.scalarParamIndex = [];

    if (defaultUniforms) {
        this.defaultUniforms = defaultUniforms;
    }
    if (defaultAttributes) {
        this.defaultAttributes = defaultAttributes;
    }

    for (var k in table) {
        var entry = table[k];
        if (entry[0] === "propOut" && entry[1] === "this") {
	    this.thisOutTable[k] = entry;
	    this.thisOutIndex.push(k);
	} else if (entry[0] === "propOut" && entry[1] !== "this") {
	    this.otherOutTable[k] = entry;
	    this.otherOutIndex.push(k);
	} else if (entry[0] === "propIn" && entry[1] === "this") {
	    this.thisInTable[k] = entry;
	    this.thisInIndex.push(k);
	} else if (entry[0] === "propIn" && entry[1] !== "this") {
	    this.otherInTable[k] = entry;
	    this.otherInIndex.push(k);
	} else if (entry[0] === "param") {
            this.paramTable[k] = entry;
            this.paramIndex.push(k);
	} else if (entry[0] === "var") {
            this.varTable[k] = entry;
            this.varIndex.push(k);
	}
    }

    for (var i = 0; i < this.thisInIndex.length + this.otherInIndex.length; i++) {
	if (i < this.thisInIndex.length) {
	    var k = this.thisInIndex[i];
	    var elem = this.thisInTable[k];
	} else {
	    var k = this.otherInIndex[i - this.thisInIndex.length];
	    var elem = this.otherInTable[k];
	}
	this.uniformTable[k] = elem;
	this.uniformIndex.push(k);
    }

    if (this.thisOutIndex.length > 0 && this.otherOutIndex.length > 0) {
	throw "shadama cannot write into this and others from the same script."
    }

    for (var i = 0; i < this.thisOutIndex.length + this.otherOutIndex.length; i++) {
	if (i < this.thisOutIndex.length) {
	    var k = this.thisOutIndex[i];
	    var elem = this.thisOutTable[k];
	} else {
	    var k = this.otherOutIndex[i - this.thisOutIndex.length];
	    var elem = this.otherOutTable[k];
	}
	this.varyingTable[k] = elem;
	this.varyingIndex.push(k);
    }

    var usedAsOther = (n) => {
	for (var i = 0; i < this.otherInIndex.length; i++) {
	    if (this.otherInTable[this.otherInIndex[i]][1] === n) {
		return true;
	    }
	}
	for (var i = 0; i < this.otherOutIndex.length; i++) {
	    if (this.otherOutTable[this.otherOutIndex[i]][1] === n) {
		return true;
	    }
	}
	return false;
    };

    for (var i = 0; i < this.paramIndex.length; i++) {
	var k = this.paramIndex[i];
	var elem = this.paramTable[k];

	if (!usedAsOther(elem[2])) {
	    this.scalarParamTable[k] = elem;
	    this.scalarParamIndex.push(k);
	}
    }
};

SymTable.prototype.varying = function(entry) {
    var k = "propOut." + entry[1] + "." + entry[2];
    var entry = this.varyingTable[k];
    return ["v", entry[1],  entry[2]].join("_");
};

SymTable.prototype.uniform = function(entry) {
    var k = "propIn." + entry[1] + "." + entry[2];
    var entry = this.uniformTable[k];
    if (!entry) {debugger;}
    return ["u", entry[1], entry[2]].join("_");
};

SymTable.prototype.out = function(entry) {
    var k = "propOut." + entry[1] + "." + entry[2];
    var entry = this.varyingTable[k];
    return ["o", entry[1], entry[2]].join("_");
};

SymTable.prototype.uniforms = function() {
    var result = [];
    for (var k in this.uniformTable) {
	var entry = this.uniformTable[k];
	var name = ["u", entry[1], entry[2]].join("_");
        result.push("uniform sampler2D " + name + ";");
    }
    return result;
};

SymTable.prototype.paramUniforms = function() {
    var result = [];
    var that = this;
    this.scalarParamIndex.forEach(function(k) {
	var entry = that.scalarParamTable[k];
        result.push("uniform bool u_use_vector_" + entry[2] + ";");
        result.push("uniform sampler2D u_vector_" + entry[2] + ";");
        result.push("uniform float u_scalar_" + entry[2] + ";");
    });
    return result;
};

SymTable.prototype.vertVaryings = function() {
    var result = [];
    for (var i = 0; i < this.varyingIndex.length; i++) {
	var k = this.varyingIndex[i];
	var entry = this.varyingTable[k];
        result.push("out float " + this.varying(entry) + ";");
    }
    return result;
};

SymTable.prototype.fragVaryings = function() {
    var result = [];
    for (var i = 0; i < this.varyingIndex.length; i++) {
	var k = this.varyingIndex[i];
	var entry = this.varyingTable[k];
        result.push("in float " + this.varying(entry) + ";");
    }
    return result;
};

SymTable.prototype.outs = function() {
    var result = [];
    for (var i = 0; i < this.varyingIndex.length; i++) {
        var k = this.varyingIndex[i];
	var entry = this.varyingTable[k];
        result.push("layout (location = " + i + ") out float " + this.out(entry) + ";");
    }
    return result;
};

SymTable.prototype.fragColors = function() {
    var result = [];
    for (var i = 0; i < this.varyingIndex.length; i++) {
        var k = this.varyingIndex[i];
	var entry = this.varyingTable[k];
	result.push(this.out(entry) + " = " + this.varying(entry) + ";");
    }
    return result;
};

SymTable.prototype.isBuiltin = function(n) {
    return this.defaultAttributes.indexOf(n) >= 0 || this.defaultUniforms.indexOf(n) >= 0 ;
};

SymTable.prototype.insAndParamsAndOuts = function() {
    var ins = this.uniformIndex.map((k) => this.uniformTable[k]);
    var shortParams = this.paramIndex.map((k) => this.paramTable[k][2]);
    var outs = this.thisOutIndex.length != 0
	? this.thisOutIndex.map((k) => this.thisOutTable[k])
        : this.otherOutIndex.map((k) => this.otherOutTable[k]);

    return [ins, shortParams, outs];
};

class CodeStream {
    constructor() {
	this.result = [];
	this.hadCR = true;
	this.hadSpace = true;
	this.tabLevel = 0;
    }

    addTab() {
	this.tabLevel++;
    }

    decTab() {
	this.tabLevel--;
    }

    cr() {
	this.result.push("\n");
	this.hadCR = true;
    }

    tab() {
	for (var i = 0; i < this.tabLevel; i++) {
            this.result.push("  ");
	}
    }

    skipSpace() {
	this.hadSpace = true;
    }

    crIfNeeded() {
	if (!this.hadCR) {
            this.cr();
	}
    }
 
   push(val) {
	this.result.push(val);
	var last = val[val.length - 1];
	this.hadSpace = (last === " " || last == "\n" || last == "{" || last == "(");
	this.hadCR = last == "\n";
    }

    pushWithSpace(val) {
	if (!this.hadSpace) {
            this.push(" ");
	}
	this.push(val);
    }

    contents() {
	function flatten(ary) {
            return ary.reduce(function (a, b) {
		return a.concat(Array.isArray(b) ? flatten(b) : b)}, []).join("");
	};
	return flatten(this.result);
    }
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

    var match = parse(str, prod);
    if (!match.succeeded()) {
        console.log(str);
        console.log("did not parse: " + str);
    };

    var n = sem(match);
    var result = n[attr].call(n);
    var a = stringify(result);
    var b = stringify(expected);
    if (a != b) {
        console.log(str);
        console.log("rule: " + attr + " expected: " + b + " got: " + a);
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
    var newTable = {};

    for (var k in rawTable) {
        var d = defaultUniforms ? defaultUniforms : ["u_particleLength", "u_resolution"];
        var a = defaultAttributes ? defaultAttributes : ["a_index"];
        // u_resolution only needed when the code has patches.  And for patches, they'd be something else
        newTable[k] = new SymTable(rawTable[k], d, a);
    }
    return n.glsl(newTable, null, null, null);
};

function grammarUnitTests() {
    grammarTest("abc", "ident");
    grammarTest("if", "if");
    grammarTest("breed", "breed");
    grammarTest("patch", "patch");
    grammarTest("else", "else");
    grammarTest("def", "def");
    grammarTest("3.4", "number");

    grammarTest("abc", "PrimExpression");
    grammarTest("3.5", "PrimExpression");
    grammarTest("(3.5 + abc)", "PrimExpression");
    grammarTest("3.5 + abc", "AddExpression");
    grammarTest("abc - 3", "AddExpression_minus");
    grammarTest("abc * 3", "AddExpression");
    grammarTest("abc * 3", "MulExpression");
    grammarTest("abc * 3 * 3.0", "Expression");

    grammarTest("var c = 3;", "VariableStatement");

    grammarTest("this.x", "LeftHandSideExpression");
    grammarTest("patch.x", "LeftHandSideExpression");

    grammarTest("forward(this.x)", "PrimitiveCall");
    grammarTest("forward(this.x + 3)", "PrimitiveCall");
    grammarTest("turn(this.x + 3, x)", "PrimitiveCall");

    grammarTest("mod(this.x , 2)", "PrimitiveCall");

    grammarTest("forward(this.x + 3);", "Statement");

    grammarTest("a == b", "EqualityExpression");
    grammarTest("a > 3", "RelationalExpression");
    grammarTest("a > 3 + 4", "RelationalExpression");

    grammarTest("this.x = 3 + 4;", "AssignmentStatement");

    grammarTest("if (this.x > 3) {this.x = 3;} else {this.x = 4;}", "IfStatement");
    grammarTest("if (this.x > 3) {this.x = 3;}", "IfStatement");
    grammarTest("this.x + 3;", "ExpressionStatement");
    grammarTest("var x = 3;", "VariableStatement");
    grammarTest("{var x = 3; x = x + 3;}", "Block");

    grammarTest("breed Turtle (x, y)", "Breed");
    grammarTest("patch Patch (x, y)", "Patch");
    grammarTest("def Turtle.foo(x, y) {var x = 3; x = x + 2.1;}", "Script");


    semanticsTest("this.x = 3;", "Statement", s, "symTable", {"propOut.this.x": ["propOut", "this","x"]});
    semanticsTest("{this.x = 3; other.y = 4;}", "Statement", s, "symTable", {"propOut.this.x": ["propOut", "this", "x"], "propOut.other.y": ["propOut", "other", "y"]});
    semanticsTest("{this.x = 3; this.x = 4;}", "Statement", s, "symTable", {"propOut.this.x": ["propOut", "this", "x"]});

    semanticsTest("{var x = 3; x = x + 3;}", "Block", s, "symTable", {"var.x": ["var", null, "x"]});

    semanticsTest(`
       if (other.x > 0) {
         this.x = 3;
         other.a = 4;
       }
       `, "Statement", s, "symTable", {"propOut.this.x": ["propOut", "this", "x"], "propOut.other.a": ["propOut", "other", "a"], "propIn.other.x": ["propIn", "other", "x"]});

    semanticsTest(`
       if (other.x > 0) {
         this.x = 3;
         other.a = 4;
       } else {
         this.y = 3;
         other.a = 4;
       }
       `, "Statement", s, "symTable", {"propOut.this.x": ["propOut", "this", "x"], "propOut.other.a": ["propOut", "other", "a"], "propOut.this.y": ["propOut", "this", "y"], "propIn.other.x": ["propIn", "other", "x"]});


    semanticsTest("{this.x = this.y; other.z = this.x;}", "Statement", s, "symTable", {
        "propIn.this.y": ["propIn", "this", "y"],
        "propOut.this.x": ["propOut" ,"this", "x"],
        "propOut.other.z": ["propOut" ,"other", "z"],
        "propIn.this.x": ["propIn" ,"this", "x"]});

    semanticsTest("{this.x = 3; this.y = other.x;}", "Statement", s, "symTable", {
        "propOut.this.x": ["propOut" ,"this", "x"],
        "propIn.other.x": ["propIn", "other", "x"],
        "propOut.this.y": ["propOut" ,"this", "y"]});

    semanticsTest("def breed.foo(a, b, c) {this.x = 3; this.y = other.x;}", "Script", s, "symTable", {"foo": {
        "propOut.this.x": ["propOut" ,"this", "x"],
        "propIn.other.x": ["propIn", "other", "x"],
        "propOut.this.y": ["propOut" ,"this", "y"],
        "param.a": ["param" , null, "a"],
        "param.b": ["param" , null, "b"],
        "param.c": ["param" , null, "c"],
    }});

    semanticsTest("def breed.foo(a, b, c) {this.x = 4; this.y = other.x;}", "TopLevel", s, "symTable", {"foo": {
        "propOut.this.x": ["propOut" ,"this", "x"],
        "propIn.other.x": ["propIn", "other", "x"],
        "propOut.this.y": ["propOut" ,"this", "y"],
        "param.a": ["param" , null, "a"],
        "param.b": ["param" , null, "b"],
        "param.c": ["param" , null, "c"],
    }});

//    translate("this.x = this.y + 3;", "Statement", s);
    translate("breed foo (x, y)", "Breed", s);
};
