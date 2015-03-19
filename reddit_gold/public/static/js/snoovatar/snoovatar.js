!function (window, r, $, paper) {
  r.snoovatar = {};
  var exports = r.snoovatar;

  // config values
  var imagePath = '/static/snoovatar/images/';
  var filetype_old = 'png';
  var filetype = 'svg';
  var canvasSize = 400;
  var pixelRatio = 2;
  var defaultColor = '#ffffff';
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
    canvasSvgContainer: '#js-svg-canvas',
    sampleContainer: '#samples',
    sampleButton: '#generate-samples',
    publicCheckbox: '#public',
    messageBox: '#message',
    color: '#color',
    altColor: '#alt_color',
    colorLabels: '.js-snoo-color-label'
  };
  var colorReplacement = [0, 255, 0];

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

  // TODO: comment
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
   * returns a promise that resolves when an array of image sources are preloaded
   * @param  {string[]} srcs list of image sources to preload
   * @return {$.Promise}
   * @resolve {Image[]}
   */
  $.preloadImageArray = function (srcs) {
    return $.when.apply(window, $.map(srcs, function (src) {
      return $.preloadImage(src);
    }));
  };

  /**
   * returns a promise that resolves when an image is preloaded
   * @param  {string} src source of image to load
   * @return {$.Promise}
   * @resolve {Image}
   */
  $.preloadImage = function (src) {
    var def = $.Deferred();
    var img = new Image();
    img.onload = function () {
      def.resolve(img);
    };
    img.onerror = function () {
      def.reject(img);
    };
    img.src = src;
    return def.promise();
  };

  /**
   * returns an array of images that may not be loaded yet
   * @param  {string[]} srcs
   * @return {Image[]}
   */
  function loadImages(srcs) {
    return _.map(srcs, function (src) {
      var img = new Image();
      img.src = src;
      return img;
    });
  }

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

  /** TODO: drop the map, no need for it
   * promise that is resolved when the view is ready to use
   * @type {$.Promise}
   * @resolve {Object{$}} map of cached jQuery objects
   */
  var viewReady = $.when(
    uiSelectors,
    waitForDOM
  )
    .then(function buildView(uiSelectors) {
      var $view = _.reduce(uiSelectors, function (map, val, key) {
        map[key] = $(val);
        return map;
      }, {});
      $view.editable = $view.canvasContainer.hasClass('editable');
      return $view;
    });

  /**
   * promise that is resolved when images derived from tailors.json are preloaded
   * @type {$.Promise}
   * @resolve {Image[]}
   */
  var imagesAreReady = $.when(
    viewReady,
    exports.initTailors.isReady,
    exports.initSnoovatar.isReady
  )
    .then(function ($view, tailorData, snoovatarData) {
      var imageSrc = function (tailorPath, dressingName) {
        return imagePath + tailorPath + '/' + dressingName + '.' + filetype_old;
      };

      var components = snoovatarData.components || {};

      var preloadImages = _.reduce(tailorData, function (list, tailor) {
        // get the image set for each tailor in read-only view
        if (tailor.name in components) {
          if (components[tailor.name]) {
            list.push(imageSrc(tailor.asset_path, components[tailor.name]));
          }
        }
        else if (!tailor.allow_clear && tailor.dressings.length) {
          list.push(imageSrc(tailor.asset_path, tailor.dressings[0].name));
        }
        return list;
      }, []);
      var allImages = _.reduce(tailorData, function (list, tailor) {
        // get all images
        return list.concat(_.map(tailor.dressings, function (dressing) {
          return imageSrc(tailor.asset_path, dressing.name);
        }));
      }, []);

      if ($view.editable) {
        return $.preloadImageArray(preloadImages).then(function () {
          return loadImages(allImages);
        });
      }
      else {
        return $.preloadImageArray(preloadImages);
      }
    });

  // TODO:
  var svgsAreReady = $.when(
    viewReady,
    exports.initTailors.isReady,
    exports.initSnoovatar.isReady
  )
    .then(function ($view, tailorData, snoovatarData) {
      if ($view.editable) {
        // get all SVGs
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
      } else {
        // TODO: individual SVGs?
        return;
        var components = snoovatarData.components || {};

        // get the SVG set for each tailor in read-only view
        var svgsToLoad = _.reduce(tailorData, function (list, tailor) {
          if (tailor.name in components) {
            if (components[tailor.name]) {
              list.push(svgSrc(tailor.asset_path, components[tailor.name]));
            }
          } else if (!tailor.allow_clear && tailor.dressings.length) {
            list.push(svgSrc(tailor.asset_path, tailor.dressings[0].name));
          }
          return list;
        }, []);

        return $.preloadSVGs(svgsToLoad);
      }
    });

  // TODO: get rid of .svg and use .dressings[0].svg instead
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

        memo[obj.name] = _.extend({ svg: svgMap[obj.asset_path] }, obj);
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
    .then(function createSvgCanvas(svgTailors, $view) {
      function getRandomInt(min, max) {
        return window.Math.floor(window.Math.random() * (max - min + 1)) + min;
      }

      function randomizeComponents(tailors) {
        return _.reduce(tailors, function (memo, data) {
          var svgKeys = _.keys(data.svg);
          if (svgKeys && svgKeys.length) {
            memo[data.name] = {
              dressingName: (function (svgKeys) {
                if (svgKeys.length === 1) {
                  return svgKeys[0];
                } else {
                  return svgKeys[getRandomInt(0, svgKeys.length - 1)];
                }
              })(svgKeys)
            };
          }
          return memo;
        }, {});
      }

      function getNextDressingsName(dressings, activeName) {
        var dressingNames = _.pluck(dressings, 'name') || [];
        var idx = dressingNames.indexOf(activeName) + 1;
        if (idx >= dressingNames.length) {
          idx = 0;
        }
        return dressingNames[idx];
      }

      function getPrevDressingsName(dressings, activeName) {
        var dressingNames = _.pluck(dressings, 'name') || [];
        var idx = dressingNames.indexOf(activeName) - 1;
        if (idx < 0) {
          idx = dressingNames.length - 1;
        }
        return dressingNames[idx];
      }

      // make sure we convert legacy version of components
      // the idea here is before we stored just a name of dressing,
      // and now it's a complex object - name, color, etc.
      svgTailors.components = (function convertLegacyComponents(components, snooColor) {
        var deprecatedComponents = ['body-fill', 'head-fill'];
        var renamedComponents = [{ from: 'body-stroke', to: 'body' }, { from: 'head-stroke', to: 'head' }];
        var snooColorBaseElement = 'body-stroke';

        return _.reduce(components, function (memo, value, key) {
          if (deprecatedComponents.indexOf(key) < 0) {
            value = value || {};
            if (typeof value === 'string') {
              memo[key] = { dressingName: value };
              if (key === snooColorBaseElement) {
                memo[key].color = snooColor;
              }
            } else {
              memo[key] = value;
            }
          }
          return memo;
        }, {});
      })(svgTailors.components, svgTailors.snoo_color);

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
                    // TODO: color modifiers
                    console.log(rule.modifier);
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
                  //if (map) {
                  //  obj._applyColorSvgMap(map).update();
                  //}
                }
              });
            });

            obj._applyColorSvgMap(maps);
          }
          return obj;
        },
        // clears the provided tailor's colors
        clearTailorColors: function (tailorName) {
          if (tailorName && obj.components[tailorName]) {
            obj.components[tailorName] = _.omit(obj.components[tailorName], _.keys(obj.colorTypes));
          }
          return obj;
        },
        clearAllTailorsColors: function () {
          if (obj.components) {
            _.keys(obj.components).forEach(function (tailorName) {
              obj.clearTailorColors(tailorName);
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
        draw: function (newComponents) {
          if (obj.canvas && obj.project) {
            // add new set of components if provided
            if (newComponents) {
              obj.components = newComponents;
            }

            if (obj.tailors && obj.components) {
              // clear the canvas
              obj.clear();

              // clear the svg rules
              obj.svgRulesTree.clear();

              // extract all the required SVGs
              obj.svgMap = _.chain(obj.components)
                .map(function (data, key) {
                  return {
                    tailorName: key,
                    svgSrc: obj.tailors[key].svg[data.dressingName],
                    isFlipX: obj.tailors[key]['flip_x'],
                    zIndex: obj.tailors[key]['z-index']
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

              console.info('depsOn: ', _.keys(obj.svgRulesTree.depsOn));

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
            $(uiSelectors.canvasSvgContainer).append(obj.canvas);

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
          // adjust the UI
          var componentData = obj.components[obj.activeTailor];
          $container
            .find(uiSelectors.colorLabels).removeClass('is-hidden').end()
            .find(uiSelectors.color).val(componentData.color || defaultColor).end()
            .find(uiSelectors.altColor).val(componentData.altColor || defaultColor);

          var colors = obj.svgRulesTree.getUIAdjustableTailors()[obj.activeTailor] || [];
          if (colors.length === 1) {
            $container.find(uiSelectors.colorLabels + ':eq(1)').addClass('is-hidden');
          } else {
            $container.find(uiSelectors.colorLabels).addClass('is-hidden');
          }

          return obj;
        },
        // wires up user interactions
        wireup: function () {
          // bail before building UI if we're in read-only mode
          if (!$view.editable || !obj.canvas || !obj.project) {
            return obj;
          }

          // create button html for tailors with > 1 dressings
          // TODO: replace dressings to svg => _.keys(data.svg)
          if (obj.tailors) {
            var buttonTemplate = _.template('<li id="<%-name%>" class="button <%-classNameMod%>"><div class="icon"></div></li>');
            var buttonsMarkup = _.chain(obj.tailors)
              .values()
              .filter(function (data) { return data.dressings.length > 1; })
              .sortBy(function (a, b) { return a['ui-order'] - b['ui-order']; })
              .map(function (data, idx) {
                if (idx === 0) {
                  obj.activeTailor = data.name;
                }
                return buttonTemplate(_.extend({
                  classNameMod: idx === 0 ? 'selected' : ''
                }, data));
              })
              .value()
              .join('');
            $($view.tailorButtonsContainer).html(buttonsMarkup);
          }

          var $container = $(uiSelectors.container)
            .off('.snoovatar')
            .on('click.snoovatar', uiSelectors.tailorButtons, function (event) {
              $container.find(uiSelectors.tailorButtons).removeClass('selected');

              var $el = $(event.currentTarget);
              $el.addClass('selected');
              obj.activeTailor = $el.attr('id');
              $el = null;

              obj
                .clearTailorColors(obj.activeTailor)
                .updateUI($container);

              return true;
            })
            .on('click.snoovatar', uiSelectors.nextButton, function (event) {
              if (obj.activeTailor) {
                // move to the next component
                var dressings = obj.tailors[obj.activeTailor].dressings;
                var components = _.extend({}, obj.components);
                components[obj.activeTailor].dressingName =
                  getNextDressingsName(dressings, obj.components[obj.activeTailor].dressingName);

                // clear the previously set color, draw and update the UI
                obj
                  .clearTailorColors(obj.activeTailor)
                  .draw(components)
                  .updateUI($container);
              }
              return true;
            })
            .on('click.snoovatar', uiSelectors.prevButton, function (event) {
              if (obj.activeTailor) {
                // move to the prev component
                var dressings = obj.tailors[obj.activeTailor].dressings;
                var components = _.extend({}, obj.components);
                components[obj.activeTailor].dressingName =
                  getPrevDressingsName(dressings, obj.components[obj.activeTailor].dressingName);

                // clear the previously set color, draw and update the UI
                obj
                  .clearTailorColors(obj.activeTailor)
                  .draw(components)
                  .updateUI($container);
              }
              return true;
            })
            .on('click.snoovatar', uiSelectors.randomButton, function (event) {
              // clear all the previously colors, draw and update the UI
              obj
                .clearAllTailorsColors()
                .draw(randomizeComponents(obj.tailors))
                .updateUI($container);

              return true;
            })
            .on('click.snoovatar', uiSelectors.clearButton, function (event) {
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
                .draw(components)
                .updateUI($container);

              return true;
            })
            .on('click.snoovatar', uiSelectors.saveButton, function (event) {
              //$view.saveButton.attr('disabled', true);
              //var isPublic = $view.publicCheckbox.is(':checked');
              //$.request('gold/snoovatar', {
              //  'api_type': 'json',
              //  'public': isPublic,
              //  'snoo_color': haberdashery.snooColor,
              //  'components': JSON.stringify(haberdashery.export())
              //}, function (res) {
              //  $view.saveButton.removeAttr('disabled');
              //  $view.messageBox.stop();
              //
              //  var err = null;
              //  if (!res || !res.json) {
              //    err = 'unable to save snoovatar';
              //  }
              //  else if (res.json.errors.length) {
              //    err = res.json.errors.join('\n ');
              //  }
              //  if (err) {
              //    $view.messageBox.addClass('error');
              //  }
              //  else {
              //    $view.messageBox.removeClass('error');
              //  }
              //
              //  var messageText = err ? err : 'snoovatar updated!';
              //  $view.messageBox
              //    .text(messageText)
              //    .slideDown()
              //    .delay(2500)
              //    .slideUp();
              //});
              //return false;
              return true;
            })
            .on('click.snoovatar', uiSelectors.downloadButton, function (event) {
              event.currentTarget.href = obj.canvas.toDataURL('image/png');
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

      window.obj = obj;
      return obj.init(svgTailors.components, svgTailors.tailors).wireup();
    });

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

  window.svgRuleParser = {
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

  /**
   * promise that is resolved when the main controller object (Haberdashery) is
   * ready.
   * @type {$.Promise}
   * @resolve {Haberdashery}
   */
  var haberdasheryReady = $.when(
    imagesAreReady,
    exports.initTailors.isReady,
    exports.initSnoovatar.isReady
  )
    .then(function buildImageMap(images, tailorData, snoovatarData) {
      var imageMap = _.reduce(images, function (map, img) {
        var parts = img.src.split('/').slice(-2);
        var dressing = parts[1].slice(0, -(filetype_old.length + 1));
        var tailor = parts[0];
        if (typeof map[tailor] === 'undefined') {
          map[tailor] = {};
        }
        map[tailor][dressing] = img;
        return map;
      }, {});

      var tailors = _.map(tailorData, function (obj) {
        return new Tailor(obj,
          imageMap[obj.asset_path],
          (snoovatarData || {}).snoo_color);
      });

      return new Haberdashery(tailors,
        (snoovatarData || {}).components || {},
        (snoovatarData || {}).snoo_color);
    });

  // build UI and bind event handlers
  $.when(
    haberdasheryReady,
    viewReady,
    exports.initSnoovatar.isReady
  )
    .then(function initView(haberdashery, $view, snoovatarData) {
      $view.canvasContainer.append(haberdashery.canvas);

      // bail before building UI if we're in read-only mode
      if (!$view.editable) {
        return;
      }

      var $activeButton = $($view.tailorButtonsContainer).find('li:eq(0)');
      haberdashery.setTailor($activeButton.attr('id'));
      $view.tailorButtonsContainer.on('click', 'li', function () {
        $activeButton = $(this);
        haberdashery.setTailor($activeButton.attr('id'));
      });

      $view.nextButton.on('click', function () {
        haberdashery.getActiveTailor().next();
        haberdashery.update();
      });

      $view.prevButton.on('click', function () {
        haberdashery.getActiveTailor().prev();
        haberdashery.update();
      });

      $view.randomButton.on('click', function () {
        haberdashery.randomize();
      });

      $view.clearButton.on('click', function () {
        haberdashery.clearAll();
      });

      $view.saveButton.on('click', function () {
        $view.saveButton.attr('disabled', true);
        var isPublic = $view.publicCheckbox.is(':checked');
        $.request('gold/snoovatar', {
          'api_type': 'json',
          'public': isPublic,
          'snoo_color': haberdashery.snooColor,
          'components': JSON.stringify(haberdashery.export())
        }, function (res) {
          $view.saveButton.removeAttr('disabled');
          $view.messageBox.stop();

          var err = null;
          if (!res || !res.json) {
            err = 'unable to save snoovatar';
          }
          else if (res.json.errors.length) {
            err = res.json.errors.join('\n ');
          }
          if (err) {
            $view.messageBox.addClass('error');
          }
          else {
            $view.messageBox.removeClass('error');
          }

          var messageText = err ? err : 'snoovatar updated!';
          $view.messageBox
            .text(messageText)
            .slideDown()
            .delay(2500)
            .slideUp();
        });
        return false;
      });

      $view.color.on('change', function onColorChange() {
        haberdashery.updateColor($view.color.val());
      });
    });

  /**
   * holds common features of the Tailor and Haberdashery types, namely
   * 1) keeping track of the current element in a list of things and
   * 2) holding a reference to a Canvas element.
   * @param {*[]} elements
   * @param {int} index    starting index
   */
  function CanvasArray(elements, index) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.elements = elements;
    this.index = index;
  }

  /**
   * increment the pointer, looping if necessary
   */
  CanvasArray.prototype.next = function () {
    var n = this.elements.length;
    this.setIndex((this.index + 1) % n);
  };

  /**
   * decrement the pointer, looping if necessary
   */
  CanvasArray.prototype.prev = function () {
    var n = this.elements.length;
    this.setIndex((n + this.index - 1) % n);
  };

  /**
   * set the pointer to a specific value.
   * calls the `onChange` method for the instance if it exists
   * @param {int} i
   */
  CanvasArray.prototype.setIndex = function (i) {
    var o = this.index;
    if (i !== o) {
      this.index = i;
      if (this.onChange instanceof Function) {
        this.onChange(i, o);
      }
    }
  };

  /**
   * erase the Canvas element
   */
  CanvasArray.prototype.clearCanvas = function () {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  /**
   * a category of user-selectable dressings.
   * the snoovatar may only have one dressing from a given tailor, or if the
   * tailor allows it, none.
   * @param {Object} data an object from tailors.json
   * @param {Object} imageMap a subset of all the images for the Tailor
   * @param {Object} svgMap a subset of all the SVGs for the Tailor
   * @param {string} snooColor a hex-formatted color (e.g. '#fff' or '#ffffff')
   */
  function Tailor(data, imageMap, snooColor) {
    // A CanvasArray that draws a single image from its list at a time.
    this.name = data.name;
    this.imageMap = imageMap;
    this.spriteSize = canvasSize * pixelRatio;
    this.allowClear = data.allow_clear ? 1 : 0;
    this.useDynamicColor = data.use_dynamic_color ? 1 : 0;
    this.snooColor = snooColor || defaultColor;
    this.flipX = data.flip_x;
    this.data = data;
    this.imgLoaded = false;
    var elements = data.dressings;
    if (this.allowClear) {
      elements.unshift(Tailor.blankDressing);
    }
    CanvasArray.call(this, elements, 0);
    this.canvas.width = this.canvas.height = this.spriteSize;
    if (this.useDynamicColor) {
      this.mask = document.createElement('canvas').getContext('2d');
      this.mask.canvas.width = this.mask.canvas.height = this.spriteSize;
      this.maskBrush = document.createElement('canvas').getContext('2d');
      this.maskBrush.canvas.width = this.maskBrush.canvas.height = this.spriteSize;
    }
    // attach to img elements that are still loading so they will trigger a
    // redraw
    this.forceRedraw = _.bind(this.forceRedraw, this);
    this.onChange(this.index);
  }

  /**
   * used to pad the elements array for tailors that allow no value
   * @type {Object}
   */
  Tailor.blankDressing = { "name": "" };

  Tailor.prototype = Object.create(CanvasArray.prototype);
  Tailor.prototype.constructor = Tailor;

  /**
   * sets the selected dressing to the first element.  for tailors that
   * have `allow_clear = true`, this will be the `blankDressing` object which
   * will render a blank canvas
   */
  Tailor.prototype.clear = function () {
    this.setIndex(0);
  };

  /**
   * find the index of a dressing by name.
   * defaults to first element if not found (usually `blankDressing`)
   * @param  {string} name
   * @return {int}
   */
  Tailor.prototype.getIndexOfDressing = function (name) {
    var dressings = this.data.dressings;
    for (var i = 0, l = dressings.length; i < l; i++) {
      if (name === dressings[i].name) {
        return i;
      }
    }
    return 0;
  };

  /**
   * get the name of the currently selected dressing
   * calls the `onRedraw` method if defined
   * @return {string}
   */
  Tailor.prototype.getActiveDressingName = function () {
    var element = this.elements[this.index];
    if (element) {
      return element.name;
    }
    else {
      return '';
    }
  };

  /**
   * draws the element at the given index to the attached canvas
   * @param  {int} i index of element to draw
   */
  Tailor.prototype.drawCanvas = function (i) {
    this.clearCanvas();
    var img = this.getImage(i);
    if (img) {
      if (!img.complete) {
        img.onload = this.forceRedraw;
        this.imgLoaded = false;
      }
      else {
        this.imgLoaded = true;
      }
      if (img.width) {
        var width = this.canvas.width;
        var height = this.canvas.height;
        if (this.flipX) {
          this.ctx.translate(width, 0);
          this.ctx.scale(-1, 1);
        }
        this.ctx.drawImage(img,
          0, 0, this.spriteSize, this.spriteSize,
          0, 0, width, height);
        if (this.useDynamicColor) {
          this.ctx.globalCompositeOperation = 'source-atop';
          this.ctx.drawImage(this.maskBrush.canvas, 0, 0, width, height);
          this.ctx.globalCompositeOperation = 'source-over';
        }
        if (this.flipX) {
          this.ctx.scale(-1, 1);
          this.ctx.translate(-width, 0);
        }
      }
    }
    if (this.onRedraw instanceof Function) {
      this.onRedraw();
    }
  };

  /**
   * sets a new color, updating the maskBrush
   * @param  {string} newColor hex formatted color (e.g. '#fff' or '#ffffff')
   */
  Tailor.prototype.updateColor = function (newColor) {
    if (!this.useDynamicColor) {
      return;
    }
    // fix a rendering bug in firefox on linux. yep.
    var renderColor = (newColor.toLowerCase() === '#ffffff') ? '#feffff' : newColor;
    var width = this.canvas.width;
    var height = this.canvas.height;
    this.snooColor = newColor;
    this.maskBrush.globalCompositeOperation = 'source-over';
    this.maskBrush.clearRect(0, 0, width, height);
    this.maskBrush.drawImage(this.mask.canvas, 0, 0, width, height);
    this.maskBrush.globalCompositeOperation = 'source-in';
    this.maskBrush.fillStyle = renderColor;
    this.maskBrush.fillRect(0, 0, width, height);
    this.drawCanvas(this.index);
  };

  /**
   * called whenever the dressing changes
   * updates color and mask, then redraws
   * @param  {Number} i index of new element
   */
  Tailor.prototype.onChange = function (i) {
    if (this.useDynamicColor) {
      var img = this.getImage(i);
      if (img) {
        this.updateMask(img, useDifferenceMask, colorReplacement);
        this.updateColor(this.snooColor);
      }
    }
    this.drawCanvas(i);
  };

  // callback when drawCanvas is finished
  Tailor.prototype.onRedraw = function noop() {};

  /**
   * forces the canvas to redraw current state
   */
  Tailor.prototype.forceRedraw = function () {
    this.onChange(this.index);
  };

  /**
   * set the pointer to a new random index
   */
  Tailor.prototype.random = function () {
    var n = this.elements.length;
    var r = Math.random() * (n - 1) | 0;
    this.setIndex((this.index + 1 + r) % n);
  };

  /**
   * get the image mapped to the current index
   * @return {Image|null}
   */
  Tailor.prototype.getImage = function (i) {
    if (this.elements[i] && (this.elements[i] || {}).name) {
      return this.imageMap[this.elements[i].name];
    }
    return null;
  };

  /**
   * recalculates the mask used in applying user-defined color to layers
   * @param  {Image} img   image to base mask off of
   * @param  {boolean} smart whether to use difference blending (no IE support)
   * @param  {Int[]} rgb   [r,g,b] each in [0...255]
   * @return {}
   */
  Tailor.prototype.updateMask = function (img, smart, rgb) {
    var mctx = this.mask;
    var width = mctx.canvas.width;
    var height = mctx.canvas.height;

    mctx.globalCompositeOperation = 'source-over'
    mctx.clearRect(0, 0, width, height);
    mctx.drawImage(img, 0, 0, width, height);
    if (smart) {
      // difference filter the target color
      mctx.globalCompositeOperation = 'difference'
      mctx.fillStyle = 'rgb(' + rgb.join(',') + ')';
      mctx.fillRect(0, 0, width, height);
    }
    var maskData = mctx.getImageData(0, 0, width, height);
    var c = maskData.data;

    var t = 1;
    var isMatch, partial;
    var ii;
    if (smart) {
      // if non-ie, mask is generated with difference blending.  The areas we
      // want to fill are 100% black, or partially black areas on the borders
      // to deal with aliasing.
      isMatch = function (i) {
        return !(c[i] >= t || c[i + 1] >= t || c[i + 2] >= t);
      }
      partial = function (i) {
        return 255 - Math.max(c[i], c[i + 1], c[i + 2]);
      }
    }
    else {
      // if ie, we have to just compare against the color directly.
      isMatch = function (i) {
        return c[i] === rgb[0] && c[i + 1] === rgb[1] && c[i + 2] === rgb[2];
      }
      partial = function (i) {
        return 191;
      }
    }

    // find smaller rectangle containing area that needs color replacement
    // greatly improves speed for layers with small targets (e.g. hands)
    var minX = width;
    var minY = height;
    var maxX = 0;
    var maxY = 0;
    var sample = 4;
    for (y = 0; y < height; y += sample) {
      for (x = 0; x < width; x += sample) {
        i = (y * width + x) * 4;
        if (isMatch(i)) {
          if (x < minX) {
            minX = x;
          }
          if (x > maxX) {
            maxX = x;
          }
          if (y < minY) {
            minY = y;
          }
          if (y > maxY) {
            maxY = y;
          }
        }
      }
    }
    if (minX >= maxX || minY >= maxY) {
      mctx.clearRect(0, 0, width, height);
      return;
    }
    var pad = sample * 2;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width, maxX + pad);
    maxY = Math.min(height, maxY + pad);

    // do color replacement
    width = maxX - minX;
    height = maxY - minY;
    maskData = mctx.getImageData(minX, minY, width, height);
    c = maskData.data;
    var i, x, y;
    // makingMask: for (var i = 0, l = c.length; i < l; i += 4) {
    for (y = 0; y < height; y++) {
      makingMask: for (x = 0; x < width; x++) {
        i = (y * width + x) * 4;
        if (c[i + 3] < 255) {
          c[i + 3] = 0;
        }
        else if (isMatch(i)) {
          c[i + 3] = 255;
        }
        else {
          var nx, ny;
          var range = 1;
          checkingNeighbors: for (nx = -range; nx <= range; nx++) {
            for (ny = -range; ny <= range; ny++) {
              if (!nx && !ny) {
                continue checkingNeighbors;
              }
              ii = i + ((nx + width * ny) * 4);
              if (isMatch(ii)) {
                c[i + 3] = partial(i);
                continue makingMask;
              }
            }
          }
          c[i + 3] = 0;
        }

      }
    }
    mctx.clearRect(0, 0, mctx.canvas.width, mctx.canvas.height);
    mctx.putImageData(maskData, minX, minY);
  };

  /**
   * manages a list of tailors and does composite rendering of them
   * keeps track of which tailor the user is configuring, and allows loading
   * and exporting state
   * @param {Tailor[]} tailors
   * @param {Object{string}} components map of tailor names to dressing names
   *                                    used to set the initial state of tailors
   * @param {string} snooColor hex formatted color (e.g. '#fff' or '#ffffff')
   */
  function Haberdashery(tailors, components, snooColor) {
    CanvasArray.call(this, tailors, 0);
    this.hasUnloadedImages = true;
    this.updateOnRedraw = true;
    var onRedraw = _.bind(function (i) {
      if (this.updateOnRedraw) {
        this.update();
      }
    }, this);
    _.each(tailors, function (tailor) {
      tailor.onRedraw = onRedraw;
    });

    this.canvas.width = this.canvas.height = 800;
    this.tailorMap = _.reduce(this.elements, function (map, obj, i) {
      map[obj.name] = i;
      return map;
    }, {});
    this.snooColor = snooColor || defaultColor;
    this.serialization = null;
    if (components) {
      this.import(components);
    }
    this._initialSerialization = this._serialize();
    this.update();
  }

  /**
   * decorator for functions that prevents update propagation
   * normally, changes to tailor objects trigger an update on the haberdashery
   * for actions that change every tailor, we want to supress that and call
   * the update manually.
   * @param  {function} fnc the method
   * @return {function}     the decorated method
   */
  Haberdashery.updatesManually = function (fnc) {
    return function () {
      this.updateOnRedraw = false;
      var res = fnc.apply(this, arguments);
      this.updateOnRedraw = true;
      return res;
    };
  };

  Haberdashery.prototype = Object.create(CanvasArray.prototype);
  Haberdashery.prototype.constructor = Haberdashery;

  /**
   * render composite of tailors to given canvas context
   * @param  {CanvasRenderingContext2D} ctx
   */
  Haberdashery.prototype.drawTo = function (ctx) {
    _.each(this.elements, function (tailor) {
      ctx.drawImage(tailor.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    });
  };

  /**
   * update rendering of attached canvas
   */
  Haberdashery.prototype.drawCanvas = function () {
    this.clearCanvas();
    this.drawTo(this.ctx);
  };

  /**
   * get the Tailor that the user is currently configuring
   * @return {Tailor}
   */
  Haberdashery.prototype.getActiveTailor = function () {
    return this.elements[this.index];
  };

  /**
   * redraws the composite if necessary.
   * checks if the canvas needs to be redrawn by comparing current serialized
   * state against last state.
   */
  Haberdashery.prototype.update = function () {
    var hasUnloadedImages = this.hasUnloadedImages && _.some(this.elements, function (tailor) {
        return !tailor.imgLoaded;
      });
    var serialization = this._serialize();
    if (this.hasUnloadedImages || hasUnloadedImages ||
      this.serialization !== serialization) {
      this.hasUnloadedImages = hasUnloadedImages;
      this.serialization = serialization;
      this.drawCanvas();
    }
  };

  /**
   * serialize current state.
   * @return {string}
   */
  Haberdashery.prototype._serialize = function () {
    return _.map(this.elements, function (tailor) {
      return encodeURIComponent(tailor.name) + '=' +
        encodeURIComponent(tailor.getActiveDressingName());
    }).concat('snooColor=' + this.snooColor).join('&');
  };

  /**
   * convert a serialized state into an object suitable for importing
   * @param  {string} serialization
   * @return {Object{string}} mapping of tailor names to dressing names
   */
  Haberdashery.prototype._deserialize = function (serialization) {
    var props = serialization.split('&');
    return _.reduce(props, function (map, property) {
      var keyVal = property.split('=');
      map[keyVal[0]] = keyVal[1];
      return map;
    }, {});
  };

  /**
   * export current state
   * @param  {bool} asString return URI encoded string instead of objcet
   * @return {Object{string}|string} mapping of tailor names to dressing names
   */
  Haberdashery.prototype.export = function (asString) {
    if (asString) {
      return this._serialize();
    }
    else {
      return _.reduce(this.elements, function (props, tailor) {
        props[tailor.name] = tailor.getActiveDressingName();
        return props;
      }, {});
    }
  };

  /**
   * import state and redraw composite
   * @param  {Object{string}|string} components mapping of tailor names to
   *                                            dressing names
   */
  Haberdashery.prototype.import = Haberdashery.updatesManually(function (components) {
    if (typeof components === 'string') {
      components = this._deserialize(components);
    }
    _.each(this.elements, function (tailor) {
      var name = tailor.name;
      var dressing = _.has(components, name) ? components[name] : '';
      var i = tailor.getIndexOfDressing(dressing);
      tailor.setIndex(i);
    });
    if (typeof components.snooColor !== 'undefined') {
      this.snooColor = components.snooColor;
    }
    this.update();
  });

  /**
   * get a tailor object by name
   * @param  {string} name
   * @return {Tailor|null}
   */
  Haberdashery.prototype.getTailor = function (name) {
    if (typeof this.tailorMap[name] !== 'undefined') {
      return this.elements[this.tailorMap[name]];
    }
    else {
      return null;
    }
  };

  /**
   * set active tailor by name
   * @param {string} name
   */
  Haberdashery.prototype.setTailor = function (name) {
    if (typeof this.tailorMap[name] !== 'undefined') {
      this.setIndex(this.tailorMap[name]);
    }
  };

  /**
   * randomize all tailors' active dressings and update
   */
  Haberdashery.prototype.randomize = Haberdashery.updatesManually(function () {
    _.each(this.elements, function (tailor) {
      tailor.random();
    });
    this.update();
  });

  /**
   * set all tailors' to their default dressings (usually `blankDressing`)
   * and update
   */
  Haberdashery.prototype.clearAll = Haberdashery.updatesManually(function () {
    _.each(this.elements, function (tailor) {
      tailor.clear();
    });
    this.update();
  });

  /**
   * passes new color setting to tailors for dynamic color layers
   * @param  {string} color any valid css color
   */
  Haberdashery.prototype.updateColor = Haberdashery.updatesManually(function (newColor) {
    this.snooColor = newColor;
    _.each(this.elements, function (tailor) {
      tailor.updateColor(newColor);
    });
    this.update();
  });

  /**
   * returns the URI encoded serialized state for the nth possible combination
   * of tailor options.  has to do some calculations the first time it is called,
   * and it isn't _actually_ used anywhere now, but it is useful for generating
   * random options
   * @param  {int} n nth combination
   * @return {string} URI encoded state
   */
  Haberdashery.prototype.nth = function (n) {
    var tailors = this.elements;
    var total = 1;
    var totalsMap = {}
    var l = tailors.length;
    for (var i = 0; i < l; i++) {
      totalsMap[i] = total;
      total *= tailors[i].elements.length;
    }

    this.nth = nth;
    return nth(n);

    function nth(n) {
      n = n % total;
      var i = tailors.length;
      var m, t;
      var components = [];
      while (i--) {
        t = totalsMap[i];
        m = (n / t | 0);
        components.push(
          encodeURIComponent(tailors[i].name) + '=' +
          encodeURIComponent(tailors[i].elements[m].name)
        );
        n -= m * t;
      }
      return components.join('&');
    }
  };

}(window, window.r, window.jQuery, window.paper);
