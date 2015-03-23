!function (window, r, $, _, paper) {
  r.snoovatar = {};
  var exports = r.snoovatar;

  // config values
  var imagePath = '/static/snoovatar/images/';
  var canvasSize = 400;
  var pixelRatio = 2;
  var snooBaseTailor = 'snoo-body';
  var defaultColor = '#ffffff';
  var colorModifierValue = .3; // 30%
  var uiSelectors = {
    container: '.js-snoovatar-page',
    tailorButtonsContainer: '.selectors ul',
    tailorButtons: '.selectors ul li',
    nextButton: '#nextButton',
    prevButton: '#prevButton',
    randomButton: '#random',
    saveButton: '#save',
    downloadButton: '#download',
    clearButton: '#clear',
    canvasContainer: '#snoovatar',
    sampleContainer: '#samples',
    sampleButton: '#generate-samples',
    publicCheckbox: '#public',
    messageBox: '#message',
    color: '#color',
    altColor: '#alt_color',
    colorLabels: '.js-snoo-color-label'
  };

  /**
   * create a function with a promise property attached to it
   * the promise is resolved whenever the function is called.  the promise is
   * available as the `promise` property of the returned function, and is
   * resolved with the arguments passed to `fnc` function
   * @param  {function} fnc
   * @return {function}
   */
  function bond(fnc) {
    var d = $.Deferred();
    var agent = function () {
      d.resolve.apply(d, arguments).then(fnc);
    };
    agent.isReady = d.promise();
    return agent;
  }

  /**
   * returns a promise that is resolved when the DOM is ready
   * uses jQuery's $(document).ready()
   * @return {$.Promise}
   */
  function waitForDOM() {
    var def = $.Deferred();
    var args = Array.prototype.slice.call(arguments, 0);
    $(function () {
      def.resolve.apply(def, args);
    });
    return def.promise();
  }

  /**
   * returns a promise that resolves when an array of image sources are preloaded
   * @param  {string[]} sources list of svg bundles to load}
   * @return {$.Promise}
   * @resolve {JSON with SVG}
   */
  $.preloadSVGs = function (sources) {
    return $.when.apply(window, $.map(sources, function (src) {
      var isJson = _.isObject(src);
      var def = $.Deferred();
      r.ajax({
        url: src.url,
        type: 'GET'
      })
        .done(function (data, textStatus, jqXHR) {
          var data = jqXHR.responseText;
          if (isJson) {
            try {
              data = window.JSON.parse(data);
            } catch (e) {}
          }

          def.resolve({
            tailor: src.tailor,
            data: data
          });
        })
        .fail(function (jqXHR, textStatus, errorThrown) {
          def.resolve({
            tailor: src.tailor,
            data: null
          });
        });
      return def.promise();
    }));
  };

  /**
   * exposes a public function for the mako template to pass in tailor json data
   * data is used to resolve the attached promise
   * @param  {object} data tailors.json data
   * @return {object}
   */
  exports.initTailors = bond(function (data) {
    data.sort(function (a, b) {
      a = a['z-index'];
      b = b['z-index'];
      return a - b;
    });
    return data;
  });

  /**
   * exposes a public function for the mako template to pass in existing snoovatar
   * config.  data is used to resolve the attached promise
   * @param  {object} data saved snoovatar data (see ajax call below)
   * @return {object}
   */
  exports.initSnoovatar = bond(function (data) {
    return data;
  });

  // test for canvas support and opt out early
  var testCanvas = document.createElement('canvas');
  if (!(testCanvas.getContext && testCanvas.getContext('2d'))) {
    return $(function () {
      $(uiSelectors.canvasContainer).text(
        r._('your browser doesn\'t support snoovatars :(')
      );
    });
  }

  // test for difference blending support
  var testBlending = document.createElement('canvas').getContext('2d');
  testBlending.globalCompositeOperation = 'difference';
  var useDifferenceMask = testBlending.globalCompositeOperation === 'difference';

  /**
   * promise that is resolved when the view is ready to use
   * @type {$.Promise}
   * @resolve {Object} view related properties like isEditable, etc.
   */
  var viewReady = $.when(
    waitForDOM
  )
    .then(function buildView() {
      return {
        isEditable: $(uiSelectors.canvasContainer).hasClass('editable')
      };
    });

  /**
   * promise that is resolved when SVGs derived from tailors.json are loaded
   * @type {$.Promise}
   * @resolve {SVGs[]}
   */
  var svgsAreReady = $.when(
    exports.initTailors.isReady
  )
    .then(function (tailorData) {
      var svgBundlesToLoad = _.chain(tailorData)
        .pluck('asset_path')
        .map(function (tailor) {
          return {
            tailor: tailor,
            url: imagePath + tailor + '/svg_bundle.json'
          }
        })
        .value();

      return $.preloadSVGs(svgBundlesToLoad);
    });

  /**
   * promise that is resolved when SVGs and Tailors are loaded and bundled together
   * @type {$.Promise}
   * @resolve {[]}
   */
  var svgTailorsReady = $.when(
    svgsAreReady,
    exports.initTailors.isReady,
    exports.initSnoovatar.isReady
  )
    .then(function buildSvgMap(svgs, tailorData, snoovatarData) {
      // transform map to object literal for easier lookup
      var svgMap = _.reduce(svgs, function (aggr, svg) {
        aggr[svg.tailor] = svg.data;
        return aggr;
      }, {});

      var tailors = _.reduce(tailorData, function (memo, obj) {
        obj.dressings = _.reduce(obj.dressings || [], function (aggr, dressing) {
          if (dressing.name) {
            dressing.svg = svgMap[obj.asset_path][dressing.name];
          }
          aggr.push(dressing);
          return aggr;
        }, []);

        memo[obj.name] = obj;

        return memo;
      }, {});

      return {
        tailors: tailors,
        components: (snoovatarData || {}).components || {},
        snoo_color: (snoovatarData || {}).snoo_color
      };
    });

  // build UI and bind event handlers
  $.when(
    svgTailorsReady,
    viewReady
  )
    .then(function createSvgCanvas(svgTailors, viewData) {
      r.snooBuilder = initSnooBuilder({
        components: svgTailors.components,
        tailors: svgTailors.tailors,
        snooColor: svgTailors.snoo_color,
        isViewEditable: viewData.isEditable
      });
      return r.snooBuilder;
    });

  function initSnooBuilder(options) {
    var obj = {
      _svgNameSeparator: '::::',
      // builds out a Color-SVG map that can be used to color the canvas
      _buildColorSvgMap: function (componentColorProp, tailorName) {
        if (componentColorProp && tailorName) {
          var color = obj.components[tailorName][componentColorProp] || defaultColor;
          var allowedTailors = obj.svgRulesTree.getUIAdjustableTailors()[tailorName] || [];
          var ruleName = allowedTailors[obj.colorTypes[componentColorProp]];
          if (ruleName) {
            // direct color change
            // NOTE: the structure is { ruleName: { color, prop, [svgRefNames] } },
            //       where [svgRefNames] is an array of SVG refs that should be colored;
            //       color and prop values are the same across all SVGs inside of rule
            var svgColorSet = {};
            svgColorSet[ruleName] = _.reduce(obj.svgRulesTree.local[ruleName] || [], function (memo, rule) {
              // for local rules we have to verify tailor; otherwise,
              // we could end up changing color of several components
              // with similar name for both SVG and path/group
              if (rule.tailorName === tailorName) {
                memo.color = memo.color || color;
                memo.prop = memo.prop || (rule.prop === 'fill' ? 'fillColor' : 'strokeColor');
                memo.svgRefNames = memo.svgRefNames || [];
                memo.svgRefNames.push(rule.svgRefName);
              }
              return memo;
            }, {});

            // "depends on" color change
            // NOTE: the structure is { _ruleName: [ {color, prop, svgRefName}, ... } ],
            //       where { color, prop, svgRefName } represents individual instances
            //       rather than group them together like in direct color change;
            //       the reason for that is `modifier` property that changes color for
            //       each individual SVG instance
            var depsOnRules = obj.svgRulesTree.depsOn[ruleName] || [];
            if (depsOnRules.length) {
              svgColorSet['_' + ruleName] = _.reduce(depsOnRules, function (memo, rule) {
                var item = {
                  color: svgColorSet[ruleName].color,
                  prop: rule.prop === 'fill' ? 'fillColor' : 'strokeColor',
                  svgRefName: rule.svgRefName
                };

                // apply color modified if needed
                if (rule.modifier) {
                  if (rule.modifier === 'darker') {
                    item.color = helpers.colorLuminance(item.color, -1 * colorModifierValue);
                  } else if (rule.modifier === 'lighter') {
                    item.color = helpers.colorLuminance(item.color, colorModifierValue);
                  }
                }

                memo.push(item);
                return memo;
              }, []);
            }

            return svgColorSet;
          }
        }
        return null;
      },
      // colors the canvas
      _applyColorSvgMap: function (maps) {
        // make sure we deal with array of maps,
        // because in a single color change the incoming
        // maps property is a singular map object
        maps = _.isArray(maps) ? maps : [maps];

        _.chain(maps)
          .compact()
          .each(function (map) {
            _.each(map, function (data, key) {
              var isDepsOnRule = key.indexOf('_') === 0;
              if (isDepsOnRule) {
                // "depends on" rules are represented as an array,
                // so iterate through each individual rule
                data.forEach(function (dataItem) {
                  if (obj.svgMap[dataItem.svgRefName]) {
                    obj.svgMap[dataItem.svgRefName][dataItem.prop] = dataItem.color;
                  }
                });
              } else {
                // local rules have prop and color defined on top
                // and svgRefNames as an array to iterate through individual SVG refs
                data.svgRefNames.forEach(function (svgRefName) {
                  if (obj.svgMap[svgRefName]) {
                    obj.svgMap[svgRefName][data.prop] = data.color;
                  }
                });
              }
            });
          });

        return obj;
      },
      //
      colorTypes: {
        color: 0,
        altColor: 1
      },
      // canvas itself
      canvas: null,
      // paper.js project reference
      project: null,
      // all the tailors available to us
      tailors: null,
      // currently selected tailor to choose from in UI
      activeTailor: null,
      // currently displayed components
      components: null,
      // mostly SVG references of currently displayed components
      svgMap: null,
      // changes color of a component's color type in current tailor
      // NOTE: for colorType use obj.colorTypes dict
      changeColor: function (color, colorType, tailorName) {
        if (obj.canvas && obj.project) {
          // detect color property
          var colorProp = _.keys(obj.colorTypes)[colorType || 0];

          // set color for component, so next time we know what it's
          obj.components[tailorName][colorProp] = color;

          // apply color to the actual canvas
          var map = obj._buildColorSvgMap(colorProp, tailorName);
          if (map) {
            obj._applyColorSvgMap(map).update();
          }
        }
        return obj;
      },
      // updates the canvas to reflect all the components colors
      updateColors: function () {
        if (obj.canvas && obj.project) {
          var colorProps = _.keys(obj.colorTypes);
          var maps = [];

          // iterate through each component and...
          _.each(obj.components, function (data, tailorName) {
            // ...check if there are any color properties presented
            _.each(colorProps, function (colorProp) {
              // if so, then calculate color SVG map
              if (data[colorProp]) {
                maps.push(obj._buildColorSvgMap(colorProp, tailorName));
              }
            });
          });

          // if no maps are generated let's at least give base element some color
          if (!maps.length) {
            obj.changeColor(defaultColor, obj.colorTypes.color, snooBaseTailor);
          } else {
            obj._applyColorSvgMap(maps);
          }
        }
        return obj;
      },
      // clears the provided tailor's colors
      // NOTE: if components isn't provided obj.components gets used instead
      clearTailorColors: function (tailorName, components) {
        var local = components || obj.components;
        if (local && tailorName && local[tailorName]) {
          local[tailorName] = _.omit(local[tailorName], _.keys(obj.colorTypes));
        }
        return obj;
      },
      // clears all the tailors
      // NOTE: if components isn't provided obj.components gets used instead
      clearAllTailorsColors: function (components) {
        var local = components || obj.components;
        if (local) {
          _.keys(local).forEach(function (tailorName) {
            obj.clearTailorColors(tailorName, local);
          });
        }
        return obj;
      },
      // clears the canvas
      clear: function () {
        if (obj.canvas && obj.project) {
          if ((obj.project.layers || []).length) {
            obj.project.clear();
            obj.update();
          }
        }
        return obj;
      },
      // refreshes the canvas
      update: function () {
        if (obj.canvas && obj.project) {
          obj.project.view.draw();
        }
        return obj;
      },
      // draws new components
      draw: function (newComponents, newBaseColor) {
        if (obj.canvas && obj.project) {
          // add new set of components if provided
          if (newComponents) {
            obj.components = newComponents;
          }

          // set a new base color if specified
          if (newBaseColor) {
            obj.components[snooBaseTailor].color = newBaseColor;
          }

          if (obj.tailors && obj.components) {
            // clear the canvas
            obj.clear();

            // clear the svg rules
            obj.svgRulesTree.clear();

            // extract all the required SVGs
            obj.svgMap = _.chain(obj.components)
              .map(function (data, key) {
                var tailor = obj.tailors[key];
                return {
                  tailorName: key,
                  svgSrc: (_.where(tailor.dressings, { name: data.dressingName })[0] || {}).svg,
                  isFlipX: tailor['flip_x'],
                  zIndex: tailor['z-index']
                };
              })
              .filter(function (data) { return data.svgSrc; })
              .sortBy(function (data) { return data.zIndex; })
              .reduce(function (memo, data) {
                var svgRef = obj.project.importSVG(data.svgSrc);
                var parsed = svgChildrenParser.parse(svgRef);

                // flip object if needed
                if (data.isFlipX) {
                  var handleBounds = svgRef.handleBounds;
                  var padding = (canvasSize - handleBounds.width - handleBounds.x);
                  svgRef
                    .translate((handleBounds.x - padding) * -1, 0)
                    .scale(-1, 1);
                }

                // add SVGs to rules tree
                parsed.forEach(function (item) {
                  // we have to prepend tailor name to avoid rules overwrite
                  var itemName = data.tailorName + obj._svgNameSeparator + item.name;

                  obj.svgRulesTree.addLocal(_.filter(item.rules, function (r) { return !r.depOnName; }),
                    itemName, data.tailorName);
                  obj.svgRulesTree.addDepsOn(_.filter(item.rules, function (r) { return r.depOnName; }),
                    itemName, data.tailorName);

                  // add ref to svg map
                  memo[itemName] = item.svgRef;
                });

                return memo;
              }, {})
              .value();

            // detect colors and etc.
            obj.updateColors();

            // actual draw
            obj.update();
          }
        }
        return obj;
      },
      // initializes the canvas
      init: function (components, tailors) {
        if (!obj.canvas || !obj.project) {
          obj.tailors = tailors || {};
          obj.components = components || {};

          // create canvas itself
          obj.canvas = window.document.createElement('canvas');
          $(uiSelectors.canvasContainer).append(obj.canvas);

          // configure size and project for paper.js
          obj.project = new paper.Project(obj.canvas);
          obj.project.view.viewSize = new paper.Size(canvasSize, canvasSize);

          // trigger draw
          obj.draw();
        }
        return obj;
      },
      // updates UI for the components change
      updateUI: function ($container) {
        // enabled/disable component navigation
        if ((obj.tailors[obj.activeTailor].dressings || []).length <= 1) {
          $container
            .find(uiSelectors.nextButton).attr('disabled', 'disabled').end()
            .find(uiSelectors.prevButton).attr('disabled', 'disabled');
        } else {
          $container
            .find(uiSelectors.nextButton).removeAttr('disabled').end()
            .find(uiSelectors.prevButton).removeAttr('disabled');
        }

        // adjust number of variables colors
        var componentData = obj.components[obj.activeTailor];
        $container
          .find(uiSelectors.colorLabels).removeClass('is-hidden').end()
          .find(uiSelectors.color).val(componentData.color || defaultColor).end()
          .find(uiSelectors.altColor).val(componentData.altColor || defaultColor);

        var colors = obj.svgRulesTree.getUIAdjustableTailors()[obj.activeTailor] || [];
        if (colors.length === 1) {
          $container.find(uiSelectors.colorLabels + ':eq(1)').addClass('is-hidden');
        } else if (!colors.length) {
          $container.find(uiSelectors.colorLabels).addClass('is-hidden');
        }

        return obj;
      },
      // wires up user interactions
      wireup: function () {
        // bail before building UI if we're in read-only mode
        if (!options.isViewEditable || !obj.canvas || !obj.project) {
          return obj;
        }

        var $container = $(uiSelectors.container);

        // create button html for tailors with > 1 dressings
        if (obj.tailors) {
          var buttonTemplate = _.template('<li id="<%-name%>" class="button <%-classNameMod%>"><div class="icon"></div></li>');
          var buttons = _.chain(obj.tailors)
            .values()
            .filter(function (data) { return data.dressings.length > 1; })
            .sortBy(function (a, b) { return a['ui-order'] - b['ui-order']; })
            .map(function (data) { return buttonTemplate(_.extend({ classNameMod: '' }, data)); })
            .value();

          // add body item here because it doesn't follow above algorithm
          obj.activeTailor = snooBaseTailor;
          buttons.unshift(
            buttonTemplate({
              name: snooBaseTailor,
              classNameMod: 'selected'
            })
          );

          $container.find(uiSelectors.tailorButtonsContainer).html(buttons.join(''));
        }

        $container
          .off('.snoovatar')
          .on('click.snoovatar', uiSelectors.tailorButtons, function (event) {
            $container.find(uiSelectors.tailorButtons).removeClass('selected');

            var $el = $(event.currentTarget);
            $el.addClass('selected');
            obj.activeTailor = $el.attr('id');
            $el = null;

            obj.updateUI($container);

            return true;
          })
          .on('click.snoovatar', uiSelectors.nextButton + ':not([disabled])', function (event) {
            if (obj.activeTailor) {
              var $el = $(event.currentTarget).attr('disabled', 'disabled');

              // move to the next component
              var dressings = obj.tailors[obj.activeTailor].dressings;
              var components = _.extend({}, obj.components);
              components[obj.activeTailor].dressingName =
                helpers.getNextDressingsName(dressings, obj.components[obj.activeTailor].dressingName);

              // clear the previously set color, draw and update the UI
              obj
                .clearTailorColors(obj.activeTailor, components)
                .draw(components)
                .updateUI($container);

              $el.removeAttr('disabled');
              $el = null;
            }
            return true;
          })
          .on('click.snoovatar', uiSelectors.prevButton + ':not([disabled])', function (event) {
            if (obj.activeTailor) {
              var $el = $(event.currentTarget).attr('disabled', 'disabled');

              // move to the prev component
              var dressings = obj.tailors[obj.activeTailor].dressings;
              var components = _.extend({}, obj.components);
              components[obj.activeTailor].dressingName =
                helpers.getPrevDressingsName(dressings, obj.components[obj.activeTailor].dressingName);

              // clear the previously set color, draw and update the UI
              obj
                .clearTailorColors(obj.activeTailor, components)
                .draw(components)
                .updateUI($container);

              $el.removeAttr('disabled');
              $el = null;
            }
            return true;
          })
          .on('click.snoovatar', uiSelectors.randomButton + ':not([disabled])', function (event) {
            var $el = $(event.currentTarget).attr('disabled', 'disabled');

            // clear all the previously colors, draw and update the UI
            obj
              .clearAllTailorsColors()
              .draw(helpers.randomizeComponents(obj.tailors), helpers.getRandomColor())
              .updateUI($container);

            $el.removeAttr('disabled');
            $el = null;

            return true;
          })
          .on('click.snoovatar', uiSelectors.clearButton + ':not([disabled])', function (event) {
            var $el = $(event.currentTarget).attr('disabled', 'disabled');

            // cannot-be-cleared components
            var componentsToStay = _.chain(obj.tailors)
              .values()
              .where({ allow_clear: false })
              .reduce(function (aggr, tailor) {
                aggr[tailor.name] = tailor.dressings[0].name;
                return aggr;
              }, {})
              .value();

            // create a "clear" set of components
            var components = _.reduce(obj.components, function (memo, component, name) {
              memo[name] = componentsToStay[name] ? { dressingName: componentsToStay[name] } : {};
              return memo;
            }, {});

            // clear all the previously colors, draw and update the UI
            obj
              .clearAllTailorsColors()
              .draw(components, defaultColor)
              .updateUI($container);

            $el.removeAttr('disabled');
            $el = null;

            return true;
          })
          .on('click.snoovatar', uiSelectors.saveButton + ':not([disabled])', function (event) {
            var $el = $(event.currentTarget).attr('disabled', 'disabled');

            $.request('gold/snoovatar', {
              'api_type': 'json',
              'public': $container.find(uiSelectors.publicCheckbox).is(':checked'),
              'snoo_color': obj.components[snooBaseTailor].color || defaultColor,
              'components': window.JSON.stringify(obj.components)
            }, function (res) {
              $el.removeAttr('disabled');
              $el = null;

              var err = null;
              if (!res || !res.json) {
                err = 'unable to save snoovatar';
              } else if ((res.json.errors || []).length) {
                err = res.json.errors.join('\n ');
              }

              $container.find(uiSelectors.messageBox)
                .stop()
                .removeClass('error')
                .addClass(err ? 'error' : '')
                .text(err || 'snoovatar updated!')
                .slideDown()
                .delay(2500)
                .slideUp();
            });

            return true;
          })
          .on('click.snoovatar', uiSelectors.downloadButton + ':not([disabled])', function (event) {
            var $el = $(event.currentTarget).attr('disabled', 'disabled');

            $el[0].href = obj.canvas.toDataURL('image/png');

            $el.removeAttr('disabled');
            $el = null;

            return true;
          })
          .on('change.snoovatar', uiSelectors.color, function (event) {
            obj.changeColor(event.currentTarget.value, obj.colorTypes.color, obj.activeTailor);
            return true;
          })
          .on('change.snoovatar', uiSelectors.altColor, function (event) {
            obj.changeColor(event.currentTarget.value, obj.colorTypes.altColor, obj.activeTailor);
            return true;
          });

        return obj.updateUI($container);
      },
      // holds svg rules for drawing and color change
      svgRulesTree: {
        // keeps local rules that can be changed directly by the end user
        local: {},
        // keeps "depends on" rules that can only be changed using local value as a base
        depsOn: {},
        // clears the state
        clear: function () {
          obj.svgRulesTree.local = {};
          obj.svgRulesTree.depsOn = {};
        },
        // adds a new local rule
        addLocal: function (rules, svgRefName, tailorName) {
          obj.svgRulesTree.local = _.reduce(rules, function (memo, rule) {
            var key = rule.prop + '::' + rule.name;
            memo[key] = memo[key] || [];
            memo[key].push({
              tailorName: tailorName,
              svgRefName: svgRefName,
              prop: rule.prop
            });
            return memo;
          }, obj.svgRulesTree.local);
        },
        // adds a new "depends on" rule
        addDepsOn: function (rules, svgRefName, tailorName) {
          obj.svgRulesTree.depsOn = _.reduce(rules, function (memo, rule) {
            var parentKey = rule.depOnProp + '::' + rule.depOnName;
            memo[parentKey] = memo[parentKey] || [];
            memo[parentKey].push({
              tailorName: tailorName,
              svgRefName: svgRefName,
              prop: rule.prop,
              modifier: rule.depOnModifier
            });
            return memo;
          }, obj.svgRulesTree.depsOn);
        },
        // returns all the UI facing changeable colors
        // NOTE: returns an array for each tailor because there could be
        //       more than one color per component (alt colors and etc.);
        //       we also assume that [0] is main color, [1] is alt color
        getUIAdjustableTailors: function () {
          return _.reduce(obj.svgRulesTree.local, function (memo, items, name) {
            (items || []).forEach(function (item) {
              memo[item.tailorName] = memo[item.tailorName] || [];
              // avoid rules duplication
              if (memo[item.tailorName].indexOf(name) < 0) {
                memo[item.tailorName].push(name);
              }
            });
            return memo;
          }, {});
        }
      }
    };

    var components = helpers.convertLegacyComponents(options.components, options.snooColor);
    return obj.init(components, options.tailors).wireup();
  }

  var helpers = {
    colorLuminance: function (hex, lum) {
      // validate hex string
      hex = window.String(hex).replace(/[^0-9a-f]/gi, '');
      if (hex.length < 6) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      lum = lum || 0;

      // convert to decimal and change luminosity
      var rgb = "#", c, i;
      for (i = 0; i < 3; i++) {
        c = window.parseInt(hex.substr(i * 2, 2), 16);
        c = window.Math.round(window.Math.min(window.Math.max(0, c + (c * lum)), 255)).toString(16);
        rgb += ("00" + c).substr(c.length);
      }

      return rgb;
    },

    getRandomColor: function () {
      return '#' + window.Math.floor(window.Math.random() * 16777215).toString(16);
    },

    getRandomInt: function (min, max) {
      return window.Math.floor(window.Math.random() * (max - min + 1)) + min;
    },

    randomizeComponents: function (tailors) {
      return _.reduce(tailors, function (memo, data) {
        var keys = _.pluck(data.dressings, 'name');
        if (keys && keys.length) {
          memo[data.name] = {
            dressingName: (function (keys) {
              if (keys.length === 1) {
                return keys[0];
              } else {
                return keys[helpers.getRandomInt(0, keys.length - 1)];
              }
            })(keys)
          };
        }
        return memo;
      }, {});
    },

    getNextDressingsName: function (dressings, activeName) {
      var dressingNames = _.pluck(dressings, 'name') || [];
      var idx = dressingNames.indexOf(activeName) + 1;
      if (idx >= dressingNames.length) {
        idx = 0;
      }
      return dressingNames[idx];
    },

    getPrevDressingsName: function (dressings, activeName) {
      var dressingNames = _.pluck(dressings, 'name') || [];
      var idx = dressingNames.indexOf(activeName) - 1;
      if (idx < 0) {
        idx = dressingNames.length - 1;
      }
      return dressingNames[idx];
    },

    // make sure we convert legacy version of components
    // the idea here is before we stored just a name of dressing,
    // and now it's a complex object - name, color, etc.
    convertLegacyComponents: function (components, snooColor) {
      var deprecatedComponents = ['body-fill', 'head-fill'];
      var renamedTailors = {
        'body-stroke': 'snoo-body',
        'head-stroke': 'snoo-head'
      };
      var renamedComponents = {
        'body_stroke': 'body',
        'head_stroke': 'head'
      };

      return _.reduce(components, function (memo, value, key) {
        if (deprecatedComponents.indexOf(key) < 0) {
          value = value || {};

          if (renamedTailors[key]) {
            key = renamedTailors[key];
          }

          if (typeof value === 'string') {
            memo[key] = { dressingName: renamedComponents[value] ? renamedComponents[value] : value };
            if (key === snooBaseTailor) {
              memo[key].color = snooColor;
            }
          } else {
            memo[key] = value;
          }
        }
        return memo;
      }, {});
    }
  };

  var svgChildrenParser = {
    parse: function (svgObj) {
      var result = [];
      if (svgObj) {
        // parse current svg name
        if (svgObj.name) {
          var rules = svgRuleParser.parse(svgObj.name) || [];
          if (rules.length) {
            result.push({
              name: svgObj.name,
              svgRef: svgObj,
              rules: rules
            });
          }
        }

        // check if there are children to process
        (svgObj.children || []).forEach(function (child) {
          result = result.concat(svgChildrenParser.parse(child));
        });
      }
      return result;
    }
  };

  var svgRuleParser = {
    _separators: {
      group: '_x26__x26_',
      clause: '::',
      modifier: ':',
      prop: '-'
    },
    _splitGroups: function (name) {
      return name.split(svgRuleParser._separators.group) || [];
    },
    _splitClauses: function (name) {
      return name.split(svgRuleParser._separators.clause) || [];
    },
    _splitModifiers: function (name) {
      return name.split(svgRuleParser._separators.modifier) || [];
    },
    _splitProps: function (name) {
      return name.split(svgRuleParser._separators.prop) || [];
    },
    _parseProps: function (name) {
      // parses props: snoo-body-f
      //  => { depOnName: 'snoo-body', depOnProp: 'fill' }

      var props = svgRuleParser._splitProps(name);
      var length = props.length;
      if (length > 1) {
        // [name][prop]
        var depOnProp = props.pop();
        return {
          depOnName: props.join(svgRuleParser._separators.prop),
          depOnProp: depOnProp === 'f' ? 'fill' : 'stroke'
        };
      } else if (length === 1) {
        // [name]
        return {
          depOnName: props[0]
        };
      }
      return null;
    },
    _parseModifiers: function (name) {
      // parses modifiers: snoo-body-f:darker
      //  => { depOnName: 'snoo-body', depOnProp: 'fill', depOnModifier: 'darker' }

      var modifiers = svgRuleParser._splitModifiers(name);
      if (modifiers.length === 2) {
        // [props][modifier]
        return _.extend({
          depOnModifier: modifiers[1]
        }, svgRuleParser._parseProps(modifiers[0]));
      } else if (modifiers.length === 1) {
        // [props]
        return svgRuleParser._parseProps(modifiers[0]);
      }
      return null;
    },
    _parseName: function (name) {
      // parses grouped names: military:1
      //  => { name: 'military', group: 1 }

      var pieces = svgRuleParser._splitModifiers(name);
      if (pieces.length === 2) {
        // [name][group]
        return {
          name: pieces[0],
          group: pieces[1]
        };
      } else if (pieces.length === 1) {
        // [name]
        return {
          name: pieces[0]
        }
      }
      return null;
    },
    _parseRule: function (name) {
      // parses one rule

      var clauses = svgRuleParser._splitClauses(name);
      if (clauses.length === 3) {
        // deps [parent][prop][name]
        return _.extend({
          prop: clauses[1],
          name: clauses[2]
        }, svgRuleParser._parseModifiers(clauses[0]));
      } else if (clauses.length === 2) {
        // local [prop][name]
        return _.extend({
          prop: clauses[0]
        }, svgRuleParser._parseName(clauses[1]));
      }
      return null;
    },
    parse: function (name) {
      // SVG naming rules:
      //
      //  1) simple
      //  rule: { type[fill|stroke] }::{ name of path/group }
      //  descr: apply color to the {type} of path/group with a {name}
      //  example: fill::hand
      //           ==> apply color to {fill} of {hand}
      //
      //  2) groups (extends 1)
      //  rule: { type }::{ {name}:{group} }
      //  descr: group all the rules by {type}::{name} into a singular rule
      //  example: fill::military:1 and fill::military:2 and stroke::military:3
      //           ==> ['fill::military', 'stroke::military']
      //           ==> apply usual parsing as it's defined by 1
      //
      //  3) "depends on" (extends 1)
      //  rule: { depends on name of path/group with [-f|-s] }::{ type }::{ name }
      //  descr: apply color of the path/group that current rule {depends on}
      //         to the {type} of path/group with a {name}.
      //         {depends on} rule ends with [-f|-s] that indicates what property of parent to use.
      //         NOTE: colors of rules with a {depends on} cannot be exposed to the user
      //  example: body-f::stroke::hat
      //           ==> apply fill color of {body} to {stroke} of {hat}
      //
      //  4) "depends on" with filter (extends 3)
      //  rule: { {depends on}:{filter} }::{ type }::{ name }
      //  descr: apply color with a {filter} of the path/group that current rule {depends on}
      //         to the {type} of path/group with a {name}.
      //         {filter} is list of filter presets to choose from.
      //  example: hat-s:darker::fill::tie
      //           ==> apply {darker} stroke color of {hat} to {fill} of {tie}
      //
      //  5) combined rules
      //  rule: { rule1 }&&{ rule2 }&&{ ruleN }
      //  descr: rules can be combined together by using && operator.
      //         Adobe Illustrator interprets && as _x26__x26_
      //  example: fill::lildoo_x26__x26_fill:darker::stroke::lildoo
      //           ==> ['fill::lildoo', 'fill:darker::stroke::lildoo']
      //           ==> apply color to {fill} of {lildoo} (user facing property)
      //           ==> apply {darker} fill color of {lildoo} to {stroke} of {lildoo} (hidden property)

      var result = [];

      if (name) {
        var groups = svgRuleParser._splitGroups(name);
        result = _.reduce(groups, function (memo, group) {
          var parsedGroup = svgRuleParser._parseRule(group);
          if (parsedGroup) {
            memo.push(parsedGroup);
          }
          return memo;
        }, result);
      }

      return result;
    }
  };
}(window, window.r, window.jQuery, window._, window.paper);
