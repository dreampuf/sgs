const assert = require('assert');
const fs = require('fs');

const productionFiles = ['animation.js', 'interface.js', 'main.js'];
const forbiddenEffects = /\)\.(animate|fadeIn|fadeOut|fadeTo|delay|stop)\s*\(/;
const forbiddenSwitches = /(?:jQuery|\$)\.fx|:animated/;

for (const file of productionFiles) {
  const source = fs.readFileSync(file, 'utf8');
  assert(
    !forbiddenEffects.test(source),
    `${file} still contains a jQuery.fx animation call`,
  );
  assert(
    !forbiddenSwitches.test(source),
    `${file} still contains a jQuery.fx runtime switch`,
  );
}

const motion = fs.readFileSync('motion.js', 'utf8');
assert(
  motion.includes('element.animate(keyframes'),
  'native motion runtime must use the Web Animations API',
);
assert(
  motion.includes('animation.finished'),
  'native motion runtime must expose completion through Animation.finished',
);

const adapter = fs.readFileSync('src/browser/core-bout-adapter.ts', 'utf8');
assert(!adapter.includes('#animationDelay'), 'Core adapter still guesses animation durations');
assert(!adapter.includes('#visualReadyAt'), 'Core adapter still uses a timestamp animation barrier');
assert(
  adapter.includes('#visualBarrier'),
  'Core adapter must wait for listener animation promises',
);

const html = fs.readFileSync('index.html', 'utf8');
const motionIndex = html.indexOf('src="motion.js"');
const animationIndex = html.indexOf('src="animation.js"');
assert(motionIndex >= 0 && motionIndex < animationIndex, 'motion.js must load before animation.js');

console.log('native motion contract passed: jQuery.fx removed from production animation paths');
