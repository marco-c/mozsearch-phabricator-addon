const shelljs = require("shelljs");

shelljs.echo("Update tippy-light.css");
shelljs
  .cat([
    "node_modules/tippy.js/dist/tippy.css",
    "node_modules/tippy.js/themes/light*.css"
  ])
  .to("tippy-light.css");

shelljs.echo("Update tippy.all.js");
shelljs
  .cat([
    "node_modules/@popperjs/core/dist/umd/popper.js",
    "node_modules/tippy.js/dist/tippy.umd.js"
  ])
  .to("tippy.all.js");
