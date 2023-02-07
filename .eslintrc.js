module.exports = {
    "globals": {
        "tippy": true
    },
    "env": {
        "es6": true,
        "node": true,
        "webextensions": true
    },
    "plugins": [
        "mozilla"
    ],
    "extends": [
        "plugin:mozilla/recommended",
        "eslint:recommended"
    ],
    "parserOptions": {
        "ecmaVersion": 2022,
        "ecmaFeatures": {
            "jsx": true
        },
        "sourceType": "module"
    },
    "rules": {
        "indent": [
            "error",
            2
        ],
        "no-console": [
            "error",
            {
                "allow": ["error"]
            }
        ],
        "no-constant-condition": [
            "error",
            {
                "checkLoops": false
            }
        ] 
    }
};
