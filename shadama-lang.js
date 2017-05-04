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
                    if (ds.children[i]._node.ctorName == "Script") {
                        addAsSet(result, d);
                    }
                }
                return result;
            },

            Breed: function(_b, n, _o, fs, _c) {
                return {[n.sourceString]: fs.symTable()};
            },

            Patch: function(_p, n, _o, fs, _c) {
                return {[n.sourceString]: fs.symTable()};
            },

            Script: function(_d, _b, _p, n, _o, ns, _c, b) {
                var c = b.symTable();
                addAsSet(c, ns.symTable());
                return {[n.sourceString]: c};
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
        var js = args.frag;
        l.glsl(table, vert, frag, js);
        vert.push(op);
        r.glsl(table, vert, frag, js);
    };

    s.addOperation(
        "glsl_script_formals",
        {
            Formals_list: function(h, _c, r) {
                return [h.sourceString].concat(r.children.map(function(c) {return c.sourceString}));
            },
        });

    s.addOperation(
        "glsl_script_block(table, vert, frag, js)",
        {
            Block: function(_o, ss, _c) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                vert.pushWithSpace("{\n");
                vert.addTab();
                vert.tab();
                vert.push("vec2 oneToOne = (a_index / u_particleLength) * 2.0 - 1.0;\n");

                for (var i = 0; i < table.paramIndex.length; i++) {
                    var k = table.paramIndex[i];
                    var template1 = "float @@ = u_use_vector_@@ ? texelFetch(";
                    var template2 = ", ivec2(a_index), 0).r : u_scalar_@@;";
                    vert.tab();
                    vert.push(template1.replace(/@@/g, k));
                    vert.push(table.paramIn(["param", null, k]));
                    vert.push(template2.replace(/@@/g, k));
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
            TopLevel: function(ds) {
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

            Breed: function(_b, n, _o, fs, _c) {
                var table = this.args.table;
                var vert = new CodeStream();
                var frag = new CodeStream();
                var js = [];
                js.push("updateBreed");
                js.push(n.sourceString);
                js.push(fs.glsl_script_formals());
                return {[n.sourceString]: [table[n.sourceString], vert.contents(), frag.contents(), js]};
            },

            Patch: function(_p, n, _o, fs, _c) {
                var table = this.args.table;
                var vert = new CodeStream();
                var frag = new CodeStream();
                var js = [];
                js.push("updatePatch");
                js.push(n.sourceString);
                js.push(fs.glsl_script_formals());
                return {[n.sourceString]: [table[n.sourceString], vert.contents(), frag.contents(), js]};
            },

            Script: function(_d, _b, _p, n, _o, ns, _c, b) {
                var inTable = this.args.table;
                var table = inTable[n.sourceString];
                var vert = new CodeStream();
                var frag = new CodeStream();
                var js = [];

                vert.push("#version 300 es\n");
                vert.push("layout (location = 0) in vec2 a_index;\n");
                vert.push("uniform vec2 u_resolution;\n");
                vert.push("uniform float u_particleLength;\n");

                table.uniforms().forEach(function(elem) {
                    vert.push(elem);
                    vert.push("\n");
                });

                table.paramUniforms().forEach(function(elem) {
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

                b.glsl_script_block(table, vert, frag, js);

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

                js.push("updateScript");
                js.push(n.sourceString);
                return {[n.sourceString]: [table, vert.contents(), frag.contents(), js]};
            },

            Block: function(_o, ss, _c) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                vert.pushWithSpace("{\n");
                vert.addTab();
                ss.glsl(table, vert, frag, js);
                vert.decTab();
                vert.tab();
                vert.push("}");
            },

            StatementList: function(ss) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                for (var i = 0; i < ss.children.length; i++) {
                    vert.tab();
                    ss.children[i].glsl(table, vert, frag, js);
                    vert.cr();
                }
            },

            Statement: function(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
                this.args.vert.push(";");
            },

            IfStatement: function(_i, _o, c, _c, t, _e, optF) {
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
            AssignmentStatement: function(l, _a, e, _) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                l.glsl(table, vert, frag, js);
                vert.push(" = ");
                e.glsl(table, vert, frag, js);
            },

            VariableStatement: function(_v, d, _s) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;

                d.glsl(table, vert, frag, js);
            },

            VariableDeclaration: function(n, i) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                var js = this.args.js;
                vert.tab();
                vert.push("float");
                vert.pushWithSpace(n.sourceString);
                if (i.children.length !== 0) {
                    vert.push(" = ");
                    i.glsl(table, vert, frag, js);
                }
                vert.push(";");
                vert.cr();
            },

            Initialiser: function(_a, e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            LeftHandSideExpression_field: function(n, _p, f) {
                var table = this.args.table;
                var vert = this.args.vert;
                vert.push(table.varying(["propOut", n.sourceString, f.sourceString]));
            },

            Expression: function(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            EqualityExpression: function(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            EqualityExpression_equal: function(l, _, r) {
                transBinOp(l, r, " == ", this.args);
            },
            EqualityExpression_notEqual: function(l, _, r) {
                transBinOp(l, r, " != ", this.args);
            },

            RelationalExpression: function(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
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
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            AddExpression_plus: function(l, _, r) {
                transBinOp(l, r, " + ", this.args);
            },

            AddExpression_minus: function(l, _, r) {
                transBinOp(l, r, " - ", this.args);
            },

            MulExpression: function(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            MulExpression_times: function(l, _, r) {
                transBinOp(l, r, " * ", this.args);
            },

            MulExpression_divide: function(l, _, r) {
                transBinOp(l, r, " / ", this.args);
            },

            PrimExpression: function(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
            },

            PrimExpression_paren: function(_o, e, _c) {
                e.glsl(this.args.table, this.args.vert, this.args.frag, this.args.js);
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
                var js = this.args.js;
                vert.push(n.sourceString);
                vert.push("(");
                as.glsl(table, vert, frag, js);
                vert.push(")");
            },

            Actuals_list: function(h, _c, r) {
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
        });
};

function SymTable(table, defaultUniforms, defaultAttributes) {
    this.rawTable = table;

    this.uniformTable = {};
    this.uniformIndex = [];

    this.varyingTable = {};
    this.varyingIndex = [];

    this.outTable = {};
    this.outIndex = [];

    this.paramTable = {};
    this.paramIndex = [];

    this.varTable = {};
    this.varIndex = [];

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
            this.varyingIndex.push(entry[2]);
            this.outTable[entry[2]] = "o_this_" + entry[2];
            this.outIndex.push(entry[2]);
        } else if (entry[0] === "propIn" && entry[1] === "this") {
            this.uniformTable[entry[2]] = "u_this_" + entry[2];
            this.uniformIndex.push(entry[2]);
        } else if (entry[0] === "param") {
            this.paramTable[entry[2]] = "u_vector_" + entry[2];
            this.paramIndex.push(entry[2]);
        } else if (entry[0] === "var") {
            this.varTable[entry[2]] = entry[2];
            this.varIndex.push(entry[2]);
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

SymTable.prototype.paramUniforms = function() {
    var result = [];
    var that = this;
    this.paramIndex.forEach(function(k) {
        result.push("uniform bool u_use_vector_" + k + ";");
        result.push("uniform sampler2D u_vector_" + k + ";");
        result.push("uniform float u_scalar_" + k + ";");
    });
    return result;
};

SymTable.prototype.paramIn = function(entry) {
    return this.paramTable[entry[2]];
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
    var result = [];
    for (var i = 0; i < this.outIndex.length; i++) {
        var k = this.outIndex[i];
        result.push("layout (location = " + i + ") out float " + this.outTable[k] + ";");
    }
    return result;
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

SymTable.prototype.insAndParams = function() {
    return [this.uniformIndex, this.paramIndex];
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


    semanticsTest("this.x = 3;", "Statement", s, "symTable", {"out.this.x": ["propOut", "this","x"]});
    semanticsTest("{this.x = 3; other.y = 4;}", "Statement", s, "symTable", {"out.this.x": ["propOut", "this", "x"], "out.other.y": ["propOut", "other", "y"]});
    semanticsTest("{this.x = 3; this.x = 4;}", "Statement", s, "symTable", {"out.this.x": ["propOut", "this", "x"]});

    semanticsTest("{var x = 3; x = x + 3;}", "Block", s, "symTable", {"var.x": ["var", null, "x"]});

    semanticsTest(`
       if (other.x > 0) {
         this.x = 3;
         other.a = 4;
       }
       `, "Statement", s, "symTable", {"out.this.x": ["propOut", "this", "x"], "out.other.a": ["propOut", "other", "a"], "in.other.x": ["propIn", "other", "x"]});

    semanticsTest(`
       if (other.x > 0) {
         this.x = 3;
         other.a = 4;
       } else {
         this.y = 3;
         other.a = 4;
       }
       `, "Statement", s, "symTable", {"out.this.x": ["propOut", "this", "x"], "out.other.a": ["propOut", "other", "a"], "out.this.y": ["propOut", "this", "y"], "in.other.x": ["propIn", "other", "x"]});


    semanticsTest("{this.x = this.y; other.z = this.x;}", "Statement", s, "symTable", {
        "in.this.y": ["propIn", "this", "y"],
        "out.this.x": ["propOut" ,"this", "x"],
        "out.other.z": ["propOut" ,"other", "z"],
        "in.this.x": ["propIn" ,"this", "x"]});

    semanticsTest("{this.x = 3; this.y = other.x;}", "Statement", s, "symTable", {
        "out.this.x": ["propOut" ,"this", "x"],
        "in.other.x": ["propIn", "other", "x"],
        "out.this.y": ["propOut" ,"this", "y"]});

    semanticsTest("def breed.foo(a, b, c) {this.x = 3; this.y = other.x;}", "Script", s, "symTable", {"foo": {
        "out.this.x": ["propOut" ,"this", "x"],
        "in.other.x": ["propIn", "other", "x"],
        "out.this.y": ["propOut" ,"this", "y"],
        "param.a": ["param" , null, "a"],
        "param.b": ["param" , null, "b"],
        "param.c": ["param" , null, "c"],
    }});

    semanticsTest("def breed.foo(a, b, c) {this.x = 4; this.y = other.x;}", "TopLevel", s, "symTable", {"foo": {
        "out.this.x": ["propOut" ,"this", "x"],
        "in.other.x": ["propIn", "other", "x"],
        "out.this.y": ["propOut" ,"this", "y"],
        "param.a": ["param" , null, "a"],
        "param.b": ["param" , null, "b"],
        "param.c": ["param" , null, "c"],
    }});

//    translate("this.x = this.y + 3;", "Statement", s);
    translate("breed foo (x, y)", "Breed", s);
};
