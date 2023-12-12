const acorn = require('acorn');
const walk = require('acorn-walk');
const uglify = require('uglify-js');
const fs = require('fs');

// const code = `
// (function () {
//     const arbuz = (test) => {
//         function apple(t) {
//             function test () {
//                 return 'ttt';
//             }
//             return t + 3;
//         }
//         const aa = 1;
//         const b1 = () => 2;
//         // comment
//         return aa + b1() + apple(test);
//     }
//     return arbuz;
//  })();
// `;

console.log('Reading code from file', process.argv[2])

const code = fs.readFileSync(process.argv[2]).toString();

const functions = [];

const parseOptions = {
    ecmaVersion: 'latest',
    sourceType: 'module,'
};

const minifyOptions = {
    expression: true,
};

walk.fullAncestor(acorn.parse(code, parseOptions), (node) => {
    if (node.type === 'VariableDeclarator' && (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')) {
        const body = code.substring(node.init.start, node.init.end);
        const minCode = uglify.minify(body, minifyOptions);

        // const outerBody = code.substring(node.start, node.end);
        // const minOuterCode = uglify.minify(outerBody, minifyOptions);

        functions.push({
            name: node.id.name,
            // body,
            code: minCode.error ? { error: minCode.error, source: body } : minCode.code,
            // body,
            // outerBody,
            // node,
            // init: node.init,
        });
    } else
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        const body = code.substring(node.start, node.end);
        const minCode = uglify.minify(body);

        functions.push({
            name: node.id && node.id.name,
            // body,
            code: minCode.error ? { error: minCode.error, source: body } : minCode.code
        });
    }
});

console.log(functions.filter(({ name, code }) => !!name && !!code));
// console.log(functions);
