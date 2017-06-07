"use strict";

var g;
var s;

function initCompiler() {
    g = ohm.grammarFromScriptElement();
    s = g.createSemantics();
    initSemantics();
};

function initSemantics() {
    function addDefaults(obj) {
        obj["setCount"] = new SymTable([
            ["param", null, "num"]]);
        obj["draw"] = new SymTable([]);
        obj["fillRandom"] = new SymTable([
            ["param", null, "name"],
            ["param", null, "min"],
            ["param", null, "max"]]);
        obj["fillRandomDir"] = new SymTable([
            ["param", null, "xDir"],
            ["param", null, "yDir"]]);
        obj["fillSpace"] = new SymTable([
            ["param", null, "xName"],
            ["param", null, "yName"],
            ["param", null, "x"],
            ["param", null, "y"]]);
        obj["diffuse"] = new SymTable([
            ["param", null, "name"],
	]);
    }

    s.addOperation(
        "symTable(table)", 
        {
            TopLevel(ds) {
                var result = {};
                addDefaults(result);
                for (var i = 0; i< ds.children.length; i++) {
                    var d = ds.children[i].symTable(null);
                    var ctor = ds.children[i].ctorName;
                    if (ctor == "Script" || ctor == "Static") {
                        addAsSet(result, d);
                    }
                }
                return result;
            },

            Breed(_b, n, _o, fs, _c) {
                var table = new SymTable();
                fs.symTable(table);
                table.process();
                return {[n.sourceString]: table};
            },

            Patch(_p, n, _o, fs, _c) {
                var table = new SymTable();
                fs.symTable(table);
                table.process();
                return {[n.sourceString]: table};
            },

            Script(_d, n, _o, ns, _c, b) {
                var table = new SymTable();
                ns.symTable(table);
                b.symTable(table);
                table.process();
                return {[n.sourceString]: table};
            },

            Static(_s, n, _o, ns, _c, b) {
                var table = new SymTable();
                ns.symTable(table);
                table.process();
                return {[n.sourceString]: table};
            },

            Formals_list(h, _c, r) {
                var table = this.args.table;
                table.add("param", null, h.sourceString);
                for (var i = 0; i < r.children.length; i++) {
                    var n = r.children[i].sourceString;
                    table.add("param", null, n);
                }
                return table;
            },

            StatementList(ss) { // an iter node
                var table = this.args.table;
                for (var i = 0; i< ss.children.length; i++) {
                    ss.children[i].symTable(table);
                }
                return table;
            },

            VariableDeclaration(n, optI) {
                var table = this.args.table;
                var r = {["var." + n.sourceString]: ["var", null, n.sourceString]};
                table.add("var", null, n.sourceString);
                if (optI.children.length > 0) {
                    optI.children[0].symTable(table);
                }
                return table;
            },

            IfStatement(_if, _o, c, _c, t, _e, optF) {
                var table = this.args.table;
                c.symTable(table);
                t.symTable(table);
                if (optF.children.length > 0) {
                    optF.children[0].symTable(table);
                }
                return table;
            },

            LeftHandSideExpression_field(n, _a, f) {
                this.args.table.add("propOut", n.sourceString, f.sourceString);
                return this.args.table;
            },
            PrimExpression_field(n, _p, f) {
                var table = this.args.table;
                var name = n.sourceString;
                if (!table.isBuiltin(name)) {
                    table.add("propIn", n.sourceString, f.sourceString);
                }
                return table;
            },

            PrimExpression_variable(n) {
                return {};//["var." + n.sourceString]: ["var", null, n.sourceString]};
            },

            PrimitiveCall(n, _o, as, _c) {
                return as.symTable(this.args.table);
            },

            Actuals_list(h, _c, r) {
                var table = this.args.table;
                h.symTable(table);
                for (var i = 0; i < r.children.length; i++) {
                    r.children[i].symTable(table);
                }
                return table;
            },

            ident(_h, _r) {return this.args.table;},
            number(s) {return this.args.table;},
            _terminal() {return this.args.table;},
            _nonterminal(children) {
                var table = this.args.table;
                for (var i = 0; i < children.length; i++) {
                    children[i].symTable(table);
                }
                return table;
            },
        });

    function transBinOp(l, r, op, args) {
        var table = args.table;
        var vert = args.vert;
        var frag = args.frag;
        vert.push("(");
        l.glsl(table, vert, frag);
        vert.push(op);
        r.glsl(table, vert, frag);
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
        "glsl_helper(table, vert, frag)",
        {
            Block(_o, ss, _c) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;

                var patchInput = `
  float _x = texelFetch(u_that_x, ivec2(a_index), 0).r;
  float _y = texelFetch(u_that_y, ivec2(a_index), 0).r;
  vec2 _pos = vec2(_x, _y);
`;

                var patchPrologue = `
  vec2 oneToOne = (_pos / u_resolution) * 2.0 - 1.0;
`;

                var breedPrologue = `
  vec2 oneToOne = (a_index / u_particleLength) * 2.0 - 1.0;
`;

                var epilogue = `
  gl_Position = vec4(oneToOne, 0.0, 1.0);
  gl_PointSize = 1.0;
`;
                var breedEpilogue = `
  gl_Position = vec4(oneToOne, 0.0, 1.0);
  gl_PointSize = 1.0;
`;

                vert.pushWithSpace("{\n");
                vert.addTab();

                if (table.hasPatchInput || !table.forBreed) {
                    vert.push(patchInput);
                }
                
                if (table.forBreed) {
                    vert.push(breedPrologue);
                } else {
                    vert.push(patchPrologue);
                }

                table.scalarParamTable.keysAndValuesDo((key, entry) => {
                    var e = entry[2];
                    var template1 = `float ${e} = u_use_vector_${e} ? texelFetch(u_vector_${e}, ivec2(a_index), 0).r : u_scalar_${e};`;
                    vert.tab();
                    vert.push(template1);
                    vert.cr();
                });

                table.uniformDefaults().forEach(elem => {
		    vert.tab();
                    vert.push(elem);
                    vert.cr();
                });


                ss.glsl(table, vert, frag);
                vert.push(table.forBreed ? epilogue : epilogue);

                vert.decTab();
                vert.tab();
                vert.push("}");
            },

            Script(_d, n, _o, ns, _c, b) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;

                var breedPrologue = 
`#version 300 es
layout (location = 0) in vec2 a_index;
uniform vec2 u_resolution;
uniform float u_particleLength;
`;

                var patchPrologue = breedPrologue + `
uniform sampler2D u_that_x;
uniform sampler2D u_that_y;
`;

                vert.push(table.forBreed && !table.hasPatchInput ? breedPrologue : patchPrologue);

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
                vert.push("void main()");

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
                frag.push("void main()");

                b.glsl_helper(table, vert, frag);

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

                return {[n.sourceString]: [table, vert.contents(), frag.contents(), ["updateScript", n.sourceString]]};
            }
        });

    s.addOperation(
        "glsl(table, vert, frag)",
        {
            TopLevel(ds) {
                var table = this.args.table;
                var result = {};
                for (var i = 0; i < ds.children.length; i++) {
                    var child = ds.children[i];
                    if (child.ctorName == "Static") {
                        var js = new CodeStream();
                        var val = child.static(table, js, null, false);
                        addAsSet(result, val);
                    } else {
                        var val = child.glsl(table, null, null);
                        addAsSet(result, val);
                    }
                }
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

            Script(_d, n, _o, ns, _c, b) {
                var inTable = this.args.table;
                var table = inTable[n.sourceString];
                var vert = new CodeStream();
                var frag = new CodeStream();

                var prev = {[n.sourceString]: [table, vert.contents(), frag.contents(), []]};
                return this.glsl_helper(table, vert, frag);
            },

            Block(_o, ss, _c) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;

                vert.pushWithSpace("{");
                vert.cr();
                vert.addTab();
                ss.glsl(table, vert, frag);
                vert.decTab();
                vert.tab();
                vert.push("}");
            },

            StatementList(ss) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                for (var i = 0; i < ss.children.length; i++) {
                    vert.tab();
                    ss.children[i].glsl(table, vert, frag);
                }
            },

            Statement(e) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                e.glsl(table, vert, frag);
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
                vert.pushWithSpace("if");
                vert.pushWithSpace("(");
                c.glsl(table, vert, frag);
                vert.push(")");
                t.glsl(table, vert, frag);
                if (optF.children.length === 0) { return;}
                vert.pushWithSpace("else");
                optF.glsl(table, vert, frag);
            },

            AssignmentStatement(l, _a, e, _) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                l.glsl(table, vert, frag);
                vert.push(" = ");
                e.glsl(table, vert, frag);
            },

            VariableStatement(_v, d, _s) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                d.glsl(table, vert, frag);
            },

            VariableDeclaration(n, i) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                vert.push("float");
                vert.pushWithSpace(n.sourceString);
                if (i.children.length !== 0) {
                    vert.push(" = ");
                    i.glsl(table, vert, frag);
                }
            },

            Initialiser(_a, e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag);
            },

            LeftHandSideExpression_field(n, _p, f) {
                var table = this.args.table;
                var vert = this.args.vert;
                vert.push(table.varying(["propOut", n.sourceString, f.sourceString]));
            },

            ExpressionStatement(e ,_s) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                e.glsl(table, vert, frag);
            },

            Expression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag);
            },

            EqualityExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag);
            },

            EqualityExpression_equal(l, _, r) {
                transBinOp(l, r, " == ", this.args);
            },

            EqualityExpression_notEqual(l, _, r) {
                transBinOp(l, r, " != ", this.args);
            },

            RelationalExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag);
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

            LogicalExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag);
            },

            LogicalExpression_and(l, _, r) {
                transBinOp(l, r, " && ", this.args);
            },

            LogicalExpression_or(l, _, r) {
                transBinOp(l, r, " || ", this.args);
            },

            AddExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag);
            },

            AddExpression_plus(l, _, r) {
                transBinOp(l, r, " + ", this.args);
            },

            AddExpression_minus(l, _, r) {
                transBinOp(l, r, " - ", this.args);
            },

            MulExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag);
            },

            MulExpression_times(l, _, r) {
                transBinOp(l, r, " * ", this.args);
            },

            MulExpression_divide(l, _, r) {
                transBinOp(l, r, " / ", this.args);
            },

            UnaryExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag);
            },

            UnaryExpression_plus(_p, e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag);
            },

            UnaryExpression_minus(_p, e) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                vert.pushWithSpace("-");
                e.glsl(table, vert, frag);
            },

            PrimExpression(e) {
                e.glsl(this.args.table, this.args.vert, this.args.frag);
            },

            PrimExpression_paren(_o, e, _c) {
                e.glsl(this.args.table, this.args.vert, this.args.frag);
            },

            PrimExpression_number(e) {
                var vert = this.args.vert;
                vert.push(e.sourceString);
            },

            PrimExpression_field(n, _p, f) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;

                if (table.isBuiltin(n.sourceString)) {
                    vert.push(n.sourceString + "." + f.sourceString);
                } else {
                    if (n.sourceString === "this") {
                        vert.push("texelFetch(" +
                                  table.uniform(["propIn", n.sourceString, f.sourceString]) +
                                  ", ivec2(a_index), 0).r");
                    } else {
                        vert.push("texelFetch(" +
                                  table.uniform(["propIn", n.sourceString, f.sourceString]) +
                                  ", ivec2(_pos), 0).r");
                    }
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
                vert.push(n.sourceString);
                vert.push("(");
                as.glsl(table, vert, frag);
                vert.push(")");
            },

            Actuals_list(h, _c, r) {
                var table = this.args.table;
                var vert = this.args.vert;
                var frag = this.args.frag;
                h.glsl(table, vert, frag);
                for (var i = 0; i < r.children.length; i++) {
                    vert.push(", ");
                    r.children[i].glsl(table, vert, frag);
                }
            },

            ident(n, rest) {
                this.args.vert.push(this.sourceString);
            }
        });

    function staticTransBinOp(l, r, op, args) {
        var table = args.table;
        var js = args.js;
        var method = args.method;
        var isOther = args.isOther;
        js.push("(");
        l.static(table, js, method, isOther);
        js.push(op);
        r.static(table, js, method, isOther);
        js.push(")");
    };

    s.addOperation(
        "static_method_helper(table, js, method, isOther)",
        {
            Actuals_list(h, _c, r) {
                var table = this.args.table;
                var result = [];
                var js = new CodeStream();
                var method = this.args.method;

                function isOther(i) {
                    var realTable = table[method];
                    if (!realTable) {return false}
                    var r = realTable.usedAsOther(realTable.param.at(i)[2]);
                    return r;
                };
                h.static(table, js, method, isOther(0));
                result.push(js.contents());
                for (var i = 0; i < r.children.length; i++) {
                    var c = r.children[i];
                    var js = new CodeStream();
                    c.static(table, js, method, isOther(i+1));
                    result.push(js.contents());
                }
                return result;
            },

            Formals_list(h, _c, r) {
                var table = this.args.table;
                var result = [];
                var js = new CodeStream();

                result.push(h.sourceString);
                for (var i = 0; i < r.children.length; i++) {
                    var c = r.children[i];
                    result.push(", ");
                    result.push(c.sourceString);
                }
                return result;
            },

            empty() {
                return [];
            }
        });

    s.addOperation(
        "static(table, js, method, isOther)",
        {

            Static(_s, n, _o, fs, _c, b) {
                var table = this.args.table;
                var js = this.args.js;
                var method = this.args.method;

                js.push("(function");
                js.pushWithSpace(n.sourceString);
                js.push("(");
                js.push(fs.static_method_helper(table, null, null, null));
                js.push(") ");
                b.static(table, js, method, false);
                js.push(")");
                return {[n.sourceString]: js.contents()};
            },

            Block(_o, ss, _c) {
                var table = this.args.table;
                var js = this.args.js;
                var method = this.args.method;
                js.pushWithSpace("{");
                js.cr();
                js.addTab();
                ss.static(table, js, method, false);
                js.decTab();
                js.tab();
                js.push("}");
            },

            StatementList(ss) {
                var table = this.args.table;
                var js = this.args.js;
                var method = this.args.method;
                var isOther = this.args.isOther;
                for (var i = 0; i < ss.children.length; i++) {
                    js.tab();
                    ss.children[i].static(table, js, method, isOther);
                }
            },

            Statement(e) {
                var table = this.args.table;
                var js = this.args.js;
                var method = this.args.method;
                var isOther = this.args.isOther;
                e.static(table, js, method, isOther);
                if (e.ctorName !== "Block" && e.ctorName !== "IfStatement") {
                    js.push(";");
                    js.cr();
                } 
                if (e.ctorName == "IfStatement") {
                    js.cr();
                }
            },

            IfStatement(_i, _o, c, _c, t, _e, optF) {
                var table = this.args.table;
                var js = this.args.js;
                var method = this.args.method;
                var isOther = this.args.isOther;
                js.push("if");
                js.pushWithSpace("(");
                c.static(table, js, method, isOther);
                js.push(")");
                t.static(table, js, method, isOther);
                if (optF.children.length === 0) {return;}
                js.pushWithSpace("else");
                optF.static(table, js, method, isOther);
            },

            ExpressionStatement(e, _s) {
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            Expression(e) {
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            EqualityExpression(e) {
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            EqualityExpression_equal(l, _, r) {
                staticTransBinOp(l, r, " == ", this.args);
            },

            EqualityExpression_notEqual(l, _, r) {
                staticTransBinOp(l, r, " != ", this.args);
            },

            RelationalExpression(e) {
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            RelationalExpression_lt(l, _, r) {
                staticTransBinOp(l, r, " < ", this.args);
            },

            RelationalExpression_gt(l, _, r) {
                staticTransBinOp(l, r, " > ", this.args);
            },

            RelationalExpression_le(l, _, r) {
                staticTransBinOp(l, r, " <= ", this.args);
            },

            RelationalExpression_ge(l, _, r) {
                staticTransBinOp(l, r, " >= ", this.args);
            },

            LogicalExpression(e) {
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            LogicalExpression_and(l, _, r) {
                staticTransBinOp(l, r, " && ", this.args);
            },

            LogicalExpression_or(l, _, r) {
                staticTransBinOp(l, r, " || ", this.args);
            },

            AddExpression(e) {
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            AddExpression_plus(l, _, r) {
                staticTransBinOp(l, r, " + ", this.args);
            },

            AddExpression_minus(l, _, r) {
                staticTransBinOp(l, r, " - ", this.args);
            },

            MulExpression(e) {
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            MulExpression_times(l, _, r) {
                staticTransBinOp(l, r, " * ", this.args);
            },

            MulExpression_divide(l, _, r) {
                staticTransBinOp(l, r, " / ", this.args);
            },

            UnaryExpression(e) {
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            UnaryExpression_plus(_p, e) {
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            UnaryExpression_minus(_p, e) {
                var js = this.args.js;
                js.pushWithSpace("-");
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            PrimExpression(e) {
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            PrimExpression_paren(_o, e, _c) {
                e.static(this.args.table, this.args.js, this.args.method, this.args.isOther);
            },

            PrimExpression_string(e) {
                var js = this.args.js;
                js.push(e.sourceString);
            },

            PrimExpression_number(e) {
                var js = this.args.js;
                js.push(e.sourceString);
            },

            PrimExpression_field(n, _p, f) {
                js.push(n.sourceString + "." + f.sourceString);
            },

            PrimExpression_variable(n) {
                var table = this.args.table;
                var js = this.args.js;
                var method = this.args.method;
                var isOther = this.args.isOther;
                if (isOther) {
                    js.push('myObjects["' + n.sourceString + '"]');
                } else {
                    js.push(n.sourceString);
                }
            },

            PrimitiveCall(n, _o, as, _c) {
                js.push("'nop'");
            },

            MethodCall(r, _p, n, _o, as, _c) {
                var table = this.args.table;
                var js = this.args.js;
                var method = n.sourceString;

                if (method === "clear") {
                    js.push("clear()");
                    return;
                }

                var builtIns = ["draw", "setCount", "fillRandom", "fillSpace", "fillRandomDir", "diffuse"];

                if (builtIns.indexOf(method) >= 0) {
                    var actuals = as.static_method_helper(table, null, method, false);
                    var str = actuals.join(", ");
                    js.push(`myObjects["${r.sourceString}"].${method}(${str})`);
                    return;
                }

                var actuals = as.static_method_helper(table, null, method, false);
                var myTable = table[n.sourceString];
                var formals;
                if (myTable) {
                    formals = myTable.param;
                }                   

                if (formals && (actuals.length !== formals.size())) {
                    throw "number of arguments don't match.";
                }
                var params = new CodeStream();
                var objectsString = new CodeStream();

                params.addTab();
                objectsString.addTab();
                for (var i = 0; i < actuals.length; i++) {
                    var actual = actuals[i];
                    if (formals) {
                        var formal = formals.at(i);
                        var shortName = formal[2];
                        var isOther = myTable.usedAsOther(shortName);
                    } else {
                        var shortName = "t" + i;
                        isOther = false;
                    }

                    if (isOther) {
                        objectsString.tab();
                        objectsString.push(`objects["${shortName}"] = ${actual};\n`);
                        params.push(`params["${shortName}"] = objects["${shortName}"];\n`);
                    } else {
                        params.push(`params["${shortName}"] = ${actual};\n`);
                    }
                }

                var callProgram = `
(function() {
    var data = scripts["${n.sourceString}"];
    var func = data[0];
    var ins = data[1][0]; // [[name, <fieldName>]]
    var formals = data[1][1];
    var outs = data[1][2]; //[[object, <fieldName>]]
    var objects = {};
    objects.this = myObjects["${r.sourceString}"];
    ${objectsString.contents()}
    var params = {};
    ${params.contents()}
    func(objects, outs, ins, params);
})()`;
                js.push(callProgram);
            },
        });
};

class OrderedPair {
    constructor() {
        this.keys = [];
        this.entries = {};
    }

    add(k, entry) {
        var maybeEntry = this.entries[k];
        if (maybeEntry) {
                if (maybeEntry[0] === entry[0] &&
                    maybeEntry[1] === entry[1] &&
                    maybeEntry[2] === entry[2]) {
                    return;
                } else {
                    throw "error duplicate variable" + name
                    return;
                }
        }
        this.entries[k] = entry;
        this.keys.push(k);
    }

    addAll(other) {
        other.keysAndValuesDo((key, entry) => 
            this.add(key, entry));
    }

    at(key) {
        if (typeof key === "number") {
            return this.entries[this.keys[key]];
        } else {
            return this.entries[key];
        }
    }

    keysAndValuesDo(func) {
        for (var i = 0; i < this.keys.length; i++) {
            func(this.keys[i], this.entries[this.keys[i]]);
        }
    }

    keysAndValuesCollect(func) {
        var result = [];
        this.keysAndValuesDo((key, value) => {
            var element = func(key, value);
            result.push(element);
        });
        return result;
    }

    size() {
        return this.keys.length;
    }
};

class SymTable {
    constructor(entries) {
        this.forBreed = true;
        this.hasBreedInput = false;
        this.hasPatchInput = false;
        this.defaultUniforms = null;
        this.defaultAttributes = null;

        // - from source (extensional)
        // I use this term because I want to remember which is which)

        this.thisIn = new OrderedPair();   // v = this.x    -> ["propIn", "this", "x"]
        this.otherIn = new OrderedPair();  // v = other.x   -> ["propIn", "other", "x"]
        this.thisOut = new OrderedPair();  // this.x = ... -> ["propOut", "this", "x"]
        this.otherOut = new OrderedPair(); // other.x = ... -> ["propOut", "other", "x"]
        this.param = new OrderedPair();   // def foo(a, b, c) -> [["param", null, "a"], ...]
        this.local= new OrderedPair();    // var x = ... -> ["var", null, "x"]

        // - generated (intensional)

        this.varyingTable = new OrderedPair();
        this.uniformTable = new OrderedPair();
        this.scalarParamTable = new OrderedPair();

        if (entries) {
            for (var i = 0; i < entries.length; i++) {
                this.add.apply(this, (entries[i]))
            }
        }

        this.defaultUniforms = ["u_resolution", "u_particleLength"];
        this.defaultAttributes = ["a_index"];
    }

        
    process() {
	// maybe a hack: look for outs that are not ins and add them to ins.  Those are use
	this.thisOut.keysAndValuesDo((key, entry) => {
	    var newEntry = ["propIn", "this", entry[2]];
	    var newK = newEntry.join(".");
	    this.thisIn.add(newK, newEntry);
	});
	this.otherOut.keysAndValuesDo((key, entry) => {
	    var newEntry = ["propIn", entry[1], entry[2]];
	    var newK = newEntry.join(".");
	    this.otherIn.add(newK, newEntry);
	});


        this.uniformTable.addAll(this.thisIn);
        this.uniformTable.addAll(this.otherIn);

        if (this.thisIn.size() > 0) {
            this.hasBreedInput = true;
        }
        if (this.otherIn.size() > 0) {
            this.hasPatchInput = true;
        }

        if (this.thisOut.size() > 0 && this.otherOut.size() > 0) {
            throw "shadama cannot write into this and others from the same script."
        } else {
            this.forBreed = this.thisOut.size() > 0;
        }

        if (this.forBreed) {
            this.varyingTable.addAll(this.thisOut);
        } else {
            this.varyingTable.addAll(this.otherOut);
        }
        this.param.keysAndValuesDo((key, entry) => {
            if (!this.usedAsOther(entry[2])) {
                this.scalarParamTable.add(key, entry);
            }
        });
    };

    add(tag, rcvr, name) {
        var entry = [tag, rcvr, name];
        var k = [tag, rcvr ? rcvr : "null", name].join(".");

        if (tag === "propOut" && rcvr === "this") {
            this.thisOut.add(k, entry);
        } else if (tag === "propOut" && rcvr !== "this") {
            this.otherOut.add(k, entry);
        } else if (tag === "propIn" && rcvr === "this") {
            this.thisIn.add(k, entry);
        } else if (tag === "propIn" && rcvr !== "this") {
            this.otherIn.add(k, entry);
        } else if (tag === "param") {
            this.param.add(k, entry);
        } else if (tag === "var") {
            this.local.add(k, entry);
        }

        if ((this.otherOut.size() > 0 || this.otherIn.size() > 0) &&
            this.defaultUniforms.indexOf("u_that_x") < 0) {
            this.defaultUniforms = this.defaultUniforms.concat(["u_that_x", "u_that_y"]);
        }
    }

    usedAsOther(n) {
        var result = false;
        this.otherIn.keysAndValuesDo((k, entry) => {
            result = result | (entry[1] === n);
        });
        this.otherOut.keysAndValuesDo((k, entry) => {
            result = result | (entry[1] === n);
        });
        return result;
    }

    uniform(entry) {
        var k = ["propIn", entry[1], entry[2]].join(".");
        var entry = this.uniformTable.at(k);
        if (!entry) {
            debugger;
        }
        return ["u", entry[1], entry[2]].join("_");
    }

    varying(entry) {
        var k = ["propOut", entry[1], entry[2]].join(".");
        var entry = this.varyingTable.at(k);
        return ["v", entry[1],  entry[2]].join("_");
    }

    out(entry) {
        var k = ["propOut", entry[1], entry[2]].join(".");
        var entry = this.varyingTable.at(k);
        return ["o", entry[1],  entry[2]].join("_");
    }

    uniforms() {
        return this.uniformTable.keysAndValuesCollect((key, entry) =>
            "uniform sampler2D " + this.uniform(entry) + ";");
    }
    
    paramUniforms() {
        var result = [];
        this.scalarParamTable.keysAndValuesDo((key, entry) => {
            result.push("uniform bool u_use_vector_" + entry[2] + ";");
            result.push("uniform sampler2D u_vector_" + entry[2] + ";");
            result.push("uniform float u_scalar_" + entry[2] + ";");
        });
        return result;
    }

    vertVaryings() {
        return this.varyingTable.keysAndValuesCollect((key, entry) => 
                                                 "out float " + this.varying(entry) + ";");
    }

    fragVaryings() {
        return this.varyingTable.keysAndValuesCollect((key, entry) => 
                                                 "in float " + this.varying(entry) + ";");
    }

    uniformDefaults() {
        return this.varyingTable.keysAndValuesCollect((key, entry) => {
	    var u_entry = ["propIn", entry[1], entry[2]];
            var ind = entry[1] === "this" ? "ivec2(a_index)" : "ivec2(_pos)";
            return `${this.varying(entry)} = texelFetch(${this.uniform(u_entry)}, ${ind}, 0).r;`;
	})
    }

    outs() {
        var i = 0;
        var result = [];
        this.varyingTable.keysAndValuesDo((key, entry) => {
            result.push("layout (location = " + i + ") out float " + this.out(entry) + ";");
            i++;
        })
        return result;
    }

    fragColors() {
        return this.varyingTable.keysAndValuesCollect((key, entry) =>
                                                 this.out(entry) + " = " + this.varying(entry) + ";");
    }

    isBuiltin(n) {
        return this.defaultAttributes.indexOf(n) >= 0 || this.defaultUniforms.indexOf(n) >= 0 ;
    }
    
    insAndParamsAndOuts() {
        var ins = this.uniformTable.keysAndValuesCollect((key, entry) => [entry[1], entry[2]]);
        var shortParams = this.scalarParamTable.keysAndValuesCollect((key, entry) => entry[2]);
        var outs;
        if (this.forBreed) {
            outs = this.thisOut.keysAndValuesCollect((key, entry) => [entry[1], entry[2]]);
        } else {
            outs = this.otherOut.keysAndValuesCollect((key, entry) => [entry[1], entry[2]]);
        }
        return [ins, shortParams, outs];
    }

    rawTable() {
        var result = {};
        this.thisIn.keysAndValuesDo((key, entry) => result[key] = entry);
        this.thisOut.keysAndValuesDo((key, entry) => result[key] = entry);
        this.otherIn.keysAndValuesDo((key, entry) => result[key] = entry);
        this.otherOut.keysAndValuesDo((key, entry) => result[key] = entry);
        this.param.keysAndValuesDo((key, entry) => result[key] = entry);
        this.local.keysAndValuesDo((key, entry) => result[key] = entry);
        return result;
    }
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
            this.hadSpace = true;
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

function symTableTest(str, prod, sem, expected) {
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

    var rawTable = function(table) {
        var t;
        if (table.constructor === SymTable) {
            t = table;
        } else {
            t = table[Object.keys(table)[0]];
        }
        return t.rawTable();
    }

    var n = sem(match);
    var table = new SymTable();
    var ret = n.symTable(table);

    var result = rawTable(ret);
    var a = stringify(result);
    var b = stringify(expected);
    if (a != b) {
        console.log(str);
        console.log("Expected: " + b + " got: " + a);
    }
};

function translate(str, prod, errorCallback) {
    var match = g.match(str, "TopLevel");
    if (!match.succeeded()) {
        console.log(str);
        console.log("did not parse: " + str);
        return errorCallback(match, str);
    }

    var n = s(match);
    var symTable = n.symTable(null);
    return n.glsl(symTable, null, null);
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
    grammarTest("def foo(x, y) {var x = 3; x = x + 2.1;}", "Script");
}

function symTableUnitTests() {
    symTableTest("this.x = 3;", "Statement", s,{"propOut.this.x": ["propOut", "this","x"]});
    symTableTest("{this.x = 3; other.y = 4;}", "Statement", s,{"propOut.this.x": ["propOut", "this", "x"], "propOut.other.y": ["propOut", "other", "y"]});
    symTableTest("{this.x = 3; this.x = 4;}", "Statement", s, {"propOut.this.x": ["propOut", "this", "x"]});

    symTableTest("{var x = 3; x = x + 3;}", "Block", s, {"var.null.x": ["var", null, "x"]});

    symTableTest(`
       if (other.x > 0) {
         this.x = 3;
         other.a = 4;
       }
       `, "Statement", s, {"propOut.this.x": ["propOut", "this", "x"], "propOut.other.a": ["propOut", "other", "a"], "propIn.other.x": ["propIn", "other", "x"]});

    symTableTest(`
       if (other.x > 0) {
         this.x = 3;
         other.a = 4;
       } else {
         this.y = 3;
         other.a = 4;
       }
       `, "Statement", s, {"propOut.this.x": ["propOut", "this", "x"], "propOut.other.a": ["propOut", "other", "a"], "propOut.this.y": ["propOut", "this", "y"], "propIn.other.x": ["propIn", "other", "x"]});

    symTableTest("{this.x = this.y; other.z = this.x;}", "Statement", s, {
        "propIn.this.y": ["propIn", "this", "y"],
        "propOut.this.x": ["propOut" ,"this", "x"],
        "propOut.other.z": ["propOut" ,"other", "z"],
        "propIn.this.x": ["propIn" ,"this", "x"]});

    symTableTest("{this.x = 3; this.y = other.x;}", "Statement", s, {
        "propOut.this.x": ["propOut" ,"this", "x"],
        "propIn.other.x": ["propIn", "other", "x"],
        "propOut.this.y": ["propOut" ,"this", "y"]});

    symTableTest("def foo(a, b, c) {this.x = 3; this.y = other.x;}", "Script", s, {
        "propIn.this.x": ["propIn", "this", "x"],
        "propIn.this.y": ["propIn", "this", "y"],
        "propIn.other.x": ["propIn", "other", "x"],
        "propOut.this.x": ["propOut" ,"this", "x"],
        "propOut.this.y": ["propOut" ,"this", "y"],
        "param.null.a": ["param" , null, "a"],
        "param.null.b": ["param" , null, "b"],
        "param.null.c": ["param" , null, "c"],
    });
};

function translateTests() {
    console.log(translate("static foo() {Turtle.forward();}", "TopLevel"));

    console.log(translate("static bar(x) {if(x){ Turtle.forward();}}", "TopLevel"));
    console.log(translate("static bar(x) {if(x){ Turtle.forward();} else {Turtle.turn(x);}}", "TopLevel"));
};

