const ts = require('typescript');
const uglify = require('uglify-js');
const fs = require('fs');
const sha256 = require('sha256');
const { groupBy } = require('lodash');

const readSource = (sourceFilename) => {
    console.log(`Reading code from file ${sourceFilename}...`);

    return fs.readFileSync(sourceFilename).toString();
};

const getFunctionDefinitions = (code, sourceFilename) => {
    console.log(`Parsing file ${sourceFilename}...`);

    const root = ts.createSourceFile(
        sourceFilename,
        code,
        ts.ScriptTarget.ESNext,
        /* setParentNodes */ true
    );

    const functions = [];
    const constructors = new Set();
    const varNames = new Set();

    const minifyOptions = {
        expression: true,
    };

    const parse = (node) => {
        if (ts.isPropertyAccessExpression(node)) {
            if (node.name.escapedText === 'prototype') {
                constructors.add(node.expression.escapedText);
            }
        }

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

            if (minCode.code) {
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
        }

        ts.forEachChild(node, child => {
            if (child) {
                parse(child);
            }
        });
    };

    parse(root);

    const fns2 = functions.filter(({ name }) => !constructors.has(name));

    console.debug('Found', constructors.size, 'constructors');

    return { functions: fns2, varNames };
};

const getFunctionUsages = (code, sourceFilename, functionNames) => {
    console.log(`Parsing file ${sourceFilename}...`);

    const root = ts.createSourceFile(
        sourceFilename,
        code,
        ts.ScriptTarget.ESNext,
        /* setParentNodes */ true
    );

    const usages = [];

    const parse = (node) => {
        if (ts.isBinaryExpression(node) && ts.isIdentifier(node.right) && functionNames.has(node.right.escapedText)) {
            usages.push({
                name: node.right.escapedText,
                pos: [node.right.pos, node.right.end],
            });
        }

        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && functionNames.has(node.expression.escapedText)) {
            usages.push({
                name: node.expression.escapedText,
                pos: [node.expression.pos, node.expression.end],
            });
        }

        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.name.escapedText !== 'prototype' && functionNames.has(node.expression.escapedText)) {
            usages.push({
                name: node.expression.escapedText,
                pos: [node.expression.pos, node.expression.end],
            });
        }

        ts.forEachChild(node, child => {
            if (child) {
                parse(child);
            }
        });
    };

    parse(root);

    console.debug('Found', usages.length, 'usages');

    return { usages };
};

const generateUniqFunctionName = (varNames) => {
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

const getFunctionDefinitionsOverThreshold = ({
    sourceFilename,
    threshold,
}) => {
    const code = readSource(sourceFilename);
    const { functions } = getFunctionDefinitions(code, sourceFilename);

    const uniqueFunctions = groupBy(functions, 'hash');

    return Object.entries(uniqueFunctions)
        .filter(([ _, occurrences ]) => occurrences.length - 1 >= threshold)
        .map(([ hash, _ ]) => hash);
};

module.exports = {
    readSource,
    getFunctionDefinitionsOverThreshold,
    getFunctionDefinitions,
    getFunctionUsages,
    generateUniqFunctionName,
};
