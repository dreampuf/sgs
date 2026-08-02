var sgs = sgs || {};

(function() {
    var instant = false,
        speed = 1,
        generation = 0,
        activeAnimations = new Set(),
        activeTasks = new Set(),
        activeDelays = new Map(),
        animationsByElement = new WeakMap(),
        unitless = {
            opacity: true,
            zIndex: true,
            fontWeight: true,
            lineHeight: true,
            scale: true
        };

    var asElements = function(target) {
        if(!target)
            return [];
        if(target.nodeType)
            return [target];
        if(typeof target.length == 'number')
            return Array.prototype.slice.call(target).filter(function(item) {
                return item && item.nodeType;
            });
        return [];
    };

    var cssValue = function(property, value) {
        if(typeof value != 'number' || unitless[property])
            return String(value);
        return value + 'px';
    };

    var applyStyles = function(element, styles) {
        Object.keys(styles).forEach(function(property) {
            element.style[property] = cssValue(property, styles[property]);
        });
    };

    var registerAnimation = function(element, animation) {
        var animations = animationsByElement.get(element);
        if(!animations) {
            animations = new Set();
            animationsByElement.set(element, animations);
        }
        animations.add(animation);
        activeAnimations.add(animation);
    };

    var unregisterAnimation = function(element, animation) {
        var animations = animationsByElement.get(element);
        if(animations) {
            animations.delete(animation);
            if(animations.size == 0)
                animationsByElement.delete(element);
        }
        activeAnimations.delete(animation);
    };

    var trackTask = function(task) {
        activeTasks.add(task);
        var remove = function() {
            activeTasks.delete(task);
        };
        task.then(remove, remove);
        return task;
    };

    var cancelElement = function(element, finish) {
        var animations = animationsByElement.get(element);
        if(!animations)
            return;
        Array.from(animations).forEach(function(animation) {
            try {
                if(finish)
                    animation.finish();
                else
                    animation.cancel();
            } catch(error) {
                if(!(error instanceof DOMException) || error.name != 'InvalidStateError')
                    throw error;
            }
        });
    };

    var scaledMilliseconds = function(milliseconds) {
        return Math.max(0, Number(milliseconds) || 0) / speed;
    };

    var animateElement = function(element, keyframes, options) {
        options = options || {};
        var duration = instant ? 0 : scaledMilliseconds(options.duration),
            finalFrame = keyframes[keyframes.length - 1] || {},
            shouldApplyFinal = options.applyFinal !== false;

        if(options.replace !== false)
            cancelElement(element, false);
        if(duration == 0 || typeof element.animate != 'function') {
            if(shouldApplyFinal)
                applyStyles(element, finalFrame);
            return Promise.resolve({ completed: true });
        }

        var animation = element.animate(keyframes, {
                duration: duration,
                delay: scaledMilliseconds(options.delay),
                easing: options.easing || 'ease',
                fill: 'forwards',
                iterations: options.iterations || 1,
                direction: options.direction || 'normal'
            }),
            completed = false;
        registerAnimation(element, animation);
        return animation.finished.then(function() {
            completed = true;
        }).catch(function(error) {
            if(!error || error.name != 'AbortError')
                throw error;
        }).then(function() {
            if(completed && shouldApplyFinal)
                applyStyles(element, finalFrame);
            return { completed: completed };
        }).finally(function() {
            unregisterAnimation(element, animation);
            if(completed)
                animation.cancel();
        });
    };

    var to = function(target, styles, duration, options) {
        var tasks = asElements(target).map(function(element) {
            var computed = window.getComputedStyle(element),
                initial = {};
            Object.keys(styles).forEach(function(property) {
                initial[property] = computed[property];
            });
            return animateElement(
                element,
                [initial, Object.keys(styles).reduce(function(frame, property) {
                    frame[property] = cssValue(property, styles[property]);
                    return frame;
                }, {})],
                Object.assign({}, options || {}, { duration: duration })
            );
        });
        return trackTask(Promise.all(tasks));
    };

    var keyframes = function(target, frames, options) {
        var tasks = asElements(target).map(function(element) {
            return animateElement(element, frames, options || {});
        });
        return trackTask(Promise.all(tasks));
    };

    var delay = function(milliseconds) {
        if(instant || milliseconds <= 0)
            return Promise.resolve();
        milliseconds = scaledMilliseconds(milliseconds);
        return trackTask(new Promise(function(resolve) {
            var timer = window.setTimeout(function() {
                activeDelays.delete(timer);
                resolve();
            }, milliseconds);
            activeDelays.set(timer, resolve);
        }));
    };

    var sequence = function(steps) {
        var sequenceGeneration = generation;
        return trackTask(steps.reduce(function(chain, step) {
            return chain.then(function() {
                if(sequenceGeneration != generation)
                    return;
                return typeof step == 'function' ? step() : step;
            });
        }, Promise.resolve()));
    };

    var parallel = function(tasks) {
        return trackTask(Promise.all(tasks.map(function(task) {
            return typeof task == 'function' ? task() : task;
        })));
    };

    sgs.motion = {
        to: to,
        keyframes: keyframes,
        delay: delay,
        sequence: sequence,
        parallel: parallel,
        fadeIn: function(target, duration) {
            asElements(target).forEach(function(element) {
                element.style.display = '';
                element.style.opacity = '0';
            });
            return to(target, { opacity: 1 }, duration);
        },
        fadeOut: function(target, duration, remove) {
            return to(target, { opacity: 0 }, duration).then(function() {
                asElements(target).forEach(function(element) {
                    if(remove)
                        element.remove();
                    else
                        element.style.display = 'none';
                });
            });
        },
        cancel: function(target, finish) {
            asElements(target).forEach(function(element) {
                cancelElement(element, !!finish);
            });
        },
        cancelAll: function() {
            generation += 1;
            Array.from(activeAnimations).forEach(function(animation) {
                animation.cancel();
            });
            activeDelays.forEach(function(resolve, timer) {
                window.clearTimeout(timer);
                resolve();
            });
            activeDelays.clear();
        },
        whenIdle: function() {
            return Promise.all(Array.from(activeTasks));
        },
        isAnimating: function() {
            return activeAnimations.size > 0;
        },
        setInstant: function(value) {
            instant = !!value;
            if(instant)
                this.cancelAll();
        },
        isInstant: function() {
            return instant;
        },
        setSpeed: function(value) {
            speed = Math.max(1, Math.min(4, Number(value) || 1));
            if(document.documentElement) {
                document.documentElement.setAttribute(
                    'data-sgs-motion-speed',
                    speed.toFixed(2)
                );
            }
            return speed;
        },
        setPlayerCount: function(playerCount) {
            var count = Math.max(2, Math.min(20, Number(playerCount) || 4));
            return this.setSpeed(1 + Math.max(0, count - 4) * 0.125);
        },
        getSpeed: function() {
            return speed;
        }
    };
})(sgs);
