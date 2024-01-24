const ts = require('typescript');
const uglify = require('uglify-js');
const fs = require('fs');
const sha256 = require('sha256');
const { groupBy } = require('lodash');

module.exports.readSource = (sourceFilename) => {
    console.log(`Reading code from file ${sourceFilename}...`);

    return fs.readFileSync(sourceFilename).toString();
};

module.exports.getFunctionDefinitions = (code, sourceFilename) => {
    console.log(`Parsing file ${sourceFilename}...`);

    const root = ts.createSourceFile(
        sourceFilename,
        code,
        ts.ScriptTarget.ESNext,
        /* setParentNodes */ true
    );

    const functions = [];
    const varNames = new Set();

    const minifyOptions = {
        expression: true,
    };

    const parse = (node) => {
        if (ts.isFunctionExpression(node)) {
            node.parameters.forEach(({ name: parameterName }) => {
                if (ts.isIdentifier(parameterName)) {
                    varNames.add(parameterName.escapedText);
                } else if (ts.isObjectBindingPattern(parameterName)) {
                    parameterName.elements.forEach(({ name: bindingName }) => {
                        varNames.add(bindingName.escapedText);
                    })
                }
            });
        }

        if (ts.isArrowFunction(node)) {
            node.parameters.forEach(({ name: { escapedText: varName } }) => {
                varNames.add(varName);
            });
        }

        if (ts.isFunctionDeclaration(node)) {
            varNames.add(node.name.escapedText); // function name

            node.parameters.forEach(({ name: parameterName }) => {
                if (ts.isIdentifier(parameterName)) {
                    varNames.add(parameterName.escapedText);
                } else if (ts.isObjectBindingPattern(parameterName)) {
                    parameterName.elements.forEach(({ name: bindingName }) => {
                        varNames.add(bindingName.escapedText);
                    })
                }
            });
        }

        if (ts.isVariableDeclaration(node)) {
            varNames.add(node.name.escapedText)
        }

        if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) {
            const body = code.substring(node.pos, node.end);
            const minCode = uglify.minify(body, minifyOptions);

            functions.push({
                name: node.name && node.name.text,
                code: minCode.code,
                pos: [node.pos, node.end],
                length: node.end - node.pos,
                hash: sha256(minCode.code),
                isDeclaration: ts.isFunctionDeclaration(node),
                // node,
            });
        }

        ts.forEachChild(node, child => {
            parse(child);
        });
    };

    parse(root);

    return { functions, varNames };
};

module.exports.generateUniqFunctionName = (varNames) => {
    const g = function*() {
        const a = 'abcdefghijklmnopqrstuvwxyz$'.split('');
        const b = '0123456789'.split('');
        const c = a.concat(b);
        const l = a.length - 1;
        const k = c.length - 1;
        let r = [0];
        while (true) {
            yield r.map(x => c[x]).join('');

            if (r[0] === l && r.slice(1).every(x => x === k)) {
                r = r.map(_ => 0).concat([0]);
            } else if (r[0] < l) {
                r[0]++;
            } else {
                r[r.slice(1).findIndex(x => x < k) + 1]++;
            }
        }
    };

    const g1 = g();

    let name = g1.next().value;

    while (varNames.has(name)) {
        name = g1.next().value;
    }

    return name;
};

module.exports.getFunctionDefinitionsOverThreshold = (functions, threshold) => {
    const uniqueFunctions = groupBy(functions, 'hash');

    return Object.entries(uniqueFunctions)
        .filter(([ _, occurrences ]) => occurrences.length - 1 >= threshold)
        .map(([ hash, _ ]) => hash);
};
