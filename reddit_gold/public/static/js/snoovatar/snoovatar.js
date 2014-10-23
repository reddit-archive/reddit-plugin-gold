!function(r, $) {
  r.snoovatar = {};
  var exports = r.snoovatar;

  // config values
  var imagePath = r.utils.staticURL('snoovatar/images/');
  var filetype = 'png';
  var canvasSize = 400;
  var pixelRatio = 2;
  var uiSelectors = {
    tailorButtons: '.selectors ul',
    nextButton: '#nextButton',
    prevButton: '#prevButton',
    randomButton: '#random',
    saveButton: '#save',
    clearButton: '#clear',
    canvasContainer: '#snoovatar',
    sampleContainer: '#samples',
    sampleButton: '#generate-samples',
    publicCheckbox: '#public',
    messageBox: '#message',
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
    var agent = function() {
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
    $(function() {
      def.resolve.apply(def, args);
    });
    return def.promise();
  }

  /**
   * returns a promise that resolves when an array of image sources are preloaded
   * @param  {string[]} srcs list of image sources to preload
   * @return {$.Promise}
   * @resolve {Image[]}
   */
  $.preloadImageArray = function(srcs) {
    return $.when.apply(window, $.map(srcs, function(src) {
      return $.preloadImage(src);
    }));
  };

  /**
   * returns a promise that resolves when an image is preloaded
   * @param  {string} src source of image to load
   * @return {$.Promise}
   * @resolve {Image}
   */
  $.preloadImage = function(src) {
    var def = $.Deferred();
    var img = new Image();
    img.onload = function() {
      def.resolve(img);
    };
    img.onerror = function() {
      def.reject(img);
    };
    img.src = src;
    return def.promise();
  };

  /**
   * returns an image with the given src that _may_ not be loaded yet
   * @param  {string} src 
   * @return {Image}     
   */
  function loadImage(src) {
    var img = new Image();
    img.src = src;
    return img;
  }

  /**
   * returns an array of images that may not be loaded yet
   * @param  {string[]} srcs
   * @return {Image[]}
   */
  function loadImages(srcs) {
    return _.map(srcs, loadImage);
  }

  /**
   * exposes a public function for the mako template to pass in tailor json data
   * data is used to resolve the attached promise
   * @param  {object} data tailors.json data
   * @return {object}
   */
  exports.initTailors = bond(function(data) {
    data.sort(function(a, b) {
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
  exports.initSnoovatar = bond(function(data) {
    return data;
  });

  // test for canvas support and opt out early
  var testCanvas = document.createElement('canvas');
  if (!(testCanvas.getContext && testCanvas.getContext('2d'))) {
    return $(function() {
      $(uiSelectors.canvasContainer).text(
        r._('your browser doesn\'t support snoovatars :(')
      );
    });
  }

  /**
   * promise that is resolved when the view is ready to use
   * @type {$.Promise}
   * @resolve {Object{$}} map of cached jQuery objects
   */
  var viewReady = $.when(uiSelectors, waitForDOM)
    .then(function buildView(uiSelectors) {
      var $view = _.reduce(uiSelectors, function(map, val, key) {
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
    .then(function($view, tailorData, snoovatarData) {
      var getImageSources;
      var imageSrc = function(tailorName, dressingName) {
        return imagePath + tailorName + '/' + dressingName + '.' + filetype;
      }
      if (!$view.editable) {
        var components = snoovatarData ? snoovatarData.components : {};
        getImageSources = function(list, tailor) {
          // get the image set for each tailor in read-only view
          if (tailor.name in components) {
            if (components[tailor.name]) {
              list.push(imageSrc(tailor.name, components[tailor.name]));
            }
          }
          else if (!tailor.allow_clear && tailor.dressings.length) {
            list.push(imageSrc(tailor.name, tailor.dressings[0].name));
          }
          return list;
        }
      } 
      else {
        getImageSources = function(list, tailor) {
          // get all images
          return list.concat(_.map(tailor.dressings, function(dressing) {
            return imageSrc(tailor.name, dressing.name);
          }));
        };
      }
      var imageSources = _.reduce(tailorData, getImageSources, []);
      return loadImages(imageSources);
    });

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
      console.log('images loaded!')
      imageMap = _.reduce(images, function(map, img) {
        var parts = img.src.split('/').slice(-2);
        var dressing = parts[1].slice(0, -(filetype.length + 1));
        var tailor = parts[0];
        if (typeof map[tailor] === 'undefined') {
          map[tailor] = {};
        }
        map[tailor][dressing] = img;
        return map;
      }, {});

      var tailors = _.map(tailorData, function(obj) {
        return new Tailor(obj, imageMap[obj.name]);
      });
      var components = snoovatarData && snoovatarData.components || {};
      return new Haberdashery(tailors, components);
    });

  // build UI and bind event handlers
  $.when(haberdasheryReady, viewReady, exports.initSnoovatar.isReady)
    .then(function initView(haberdashery, $view, snoovatarData) {
      $view.canvasContainer.append(haberdashery.canvas);

      // bail before building UI if we're in read-only mode
      if (!$view.editable) {
        return;
      }

      // create button html for tailors with > 1 dressings
      var buttonTemplate = _.template('<li id="<%-name%>" class="button">' +
                                      '<div class="icon"></div></li>');
      var tailors = haberdashery.elements;
      var buttonMakers = tailors.slice().sort(function(a, b) {
        a = a['z-index'];
        b = b['z-index'];
        return a - b;
      });
      var buttonMarkup = _.reduce(buttonMakers, function(memo, tailor) {
        if (tailor.elements.length > 1) {
          return memo + buttonTemplate(tailor);
        }
        else {
          return memo;
        }
      }, '');
      var $buttons = $($.parseHTML(buttonMarkup));
      var $activeButton = $buttons.eq(0);
      $activeButton.addClass('selected');
      $view.tailorButtons.append($buttons);

      haberdashery.setTailor($activeButton.attr('id'));
      window.h = haberdashery
      $view.tailorButtons.on('click', 'li', function() {
        $activeButton.removeClass('selected');
        $(this).addClass('selected');
        $activeButton = $(this);
        haberdashery.setTailor($activeButton.attr('id'));
      });

      $view.nextButton.on('click', function() {
        haberdashery.getActiveTailor().next();
        haberdashery.update();
      });

      $view.prevButton.on('click', function() {
        haberdashery.getActiveTailor().prev();
        haberdashery.update();
      });

      $view.randomButton.on('click', function() {
        haberdashery.randomize();
      });

      $view.clearButton.on('click', function() {
        haberdashery.clearAll();
      });

      $view.saveButton.on('click', function() {
        $view.saveButton.attr('disabled', true);
        var isPublic = $view.publicCheckbox.is(':checked');
        $.request("gold/snoovatar", {
          "api_type": "json",
          "public": isPublic,
          "components": JSON.stringify(haberdashery.export()),
        }, function(res) {
          $view.saveButton.removeAttr('disabled');

          $view.messageBox
              .stop();

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
  CanvasArray.prototype.next = function() {
    var n = this.elements.length;
    this.setIndex((this.index + 1) % n);
  };

  /**
   * decrement the pointer, looping if necessary
   */
  CanvasArray.prototype.prev = function() {
    var n = this.elements.length;
    this.setIndex((n + this.index -1) % n);
  };

  /**
   * set the pointer to a specific value.
   * calls the `onChange` method for the instance if it exists
   * @param {int} i
   */
  CanvasArray.prototype.setIndex = function(i) {
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
  CanvasArray.prototype.clearCanvas = function() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  /**
   * a category of user-selectable dressings.
   * the snoovatar may only have one dressing from a given tailor, or if the
   * tailor allows it, none.
   * @param {Object} data an object from tailors.json
   * @param {Image} img  a spritesheet containing the dressing graphics
   */
  function Tailor(data, imageMap) {
    // A CanvasArray that draws a single image from its list at a time.
    this.name = data.name;
    this.imageMap = imageMap;
    this.spriteSize = canvasSize * pixelRatio;    
    this.allowClear = data.allow_clear ? 1 : 0;
    this.data = data;
    this.imgLoaded = false;
    var elements = data.dressings;
    if (this.allowClear) {
      elements.unshift(Tailor.blankDressing);
    }
    CanvasArray.call(this, elements, 0);
    this.canvas.width = this.canvas.height = this.spriteSize;
    // attach to img elements that are still loading so they will trigger a 
    // redraw
    this.forceRedraw = _.bind(this.forceRedraw, this);
    this.drawCanvas(this.index);
  }

  /**
   * used to pad the elements array for tailors that allow no value
   * @type {Object}
   */
  Tailor.blankDressing = {"name": "", "index": -1};

  Tailor.prototype = Object.create(CanvasArray.prototype);
  Tailor.prototype.constructor = Tailor;

  /**
   * sets the selected dressing to the first element.  for tailors that
   * have `allow_clear = true`, this will be the `blankDressing` object which
   * will render a blank canvas
   */
  Tailor.prototype.clear = function(){
    this.setIndex(0);
  };

  /**
   * find the index of a dressing by name.
   * defaults to first element if not found (usually `blankDressing`)
   * @param  {string} name
   * @return {int}
   */
  Tailor.prototype.getIndexOfDressing = function(name) {
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
   * @return {string}
   */
  Tailor.prototype.getActiveDressingName = function() {
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
  Tailor.prototype.drawCanvas = function(i) {
    this.clearCanvas();
    if (typeof this.elements[i] !== 'undefined' && this.elements[i].name) {
      var img = this.imageMap[this.elements[i].name];
      if (!img.complete) {
        img.onload = this.forceRedraw;
        this.imgLoaded = false;
      }
      else {
        this.imgLoaded = true;
      }
      if (img.width) {
        this.ctx.drawImage(img,
              0, 0, this.spriteSize, this.spriteSize,
              0, 0, this.canvas.width, this.canvas.height);
      }
    }
    if (this.onRedraw instanceof Function) {
      this.onRedraw();
    }
  };

  // redraw the canvas whenever the pointer changes
  Tailor.prototype.onChange = Tailor.prototype.drawCanvas;

  // callback when drawCanvas is finished
  Tailor.prototype.onRedraw = function noop() {};

  /**
   * forces the canvas to redraw current state
   */
  Tailor.prototype.forceRedraw = function() {
    this.drawCanvas(this.index);
  };

  /**
   * set the pointer to a new random index
   */
  Tailor.prototype.random = function() {
    var n = this.elements.length;
    var r = Math.random() * (n - 1) | 0;
    this.setIndex((this.index + 1 + r) % n);
  };

  /**
   * manages a list of tailors and does composite rendering of them
   * keeps track of which tailor the user is configuring, and allows loading
   * and exporting state
   * @param {Tailor[]} tailors
   * @param {Object{string}} components map of tailor names to dressing names
   *                                    used to set the initial state of tailors
   */
  function Haberdashery(tailors, components) {
    CanvasArray.call(this, tailors, 0);

    this.updateOnRedraw = true;
    var onRedraw = _.bind(function(i) {
      if (this.updateOnRedraw) {
        this.update();
      }
    }, this);
    _.each(tailors, function(tailor) {
      tailor.onRedraw = onRedraw;
    });

    this.canvas.width = this.canvas.height = 800;
    this.tailorMap = _.reduce(this.elements, function(map, obj, i) {
      map[obj.name] = i;
      return map;
    }, {});
    this.serialization = null;
    if (components) {
      this.import(components);
    }
    this._initialSerialization = this._serialize();
    this.drawCanvas();
  }

  Haberdashery.updatesManually = function(fnc) {
    return function() {
      this.updateOnRedraw = false;
      var res = fnc.apply(this, arguments);
      this.updateOnRedraw = true;
      return res;
    };
  }

  Haberdashery.prototype = Object.create(CanvasArray.prototype);
  Haberdashery.prototype.constructor = Haberdashery;

  /**
   * render composite of tailors to given canvas context
   * @param  {CanvasRenderingContext2D} ctx
   */
  Haberdashery.prototype.drawTo = function(ctx) {
    _.each(this.elements, function(tailor) {
      ctx.drawImage(tailor.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    });
  };

  /**
   * update rendering of attached canvas
   */
  Haberdashery.prototype.drawCanvas = function() {
    this.clearCanvas();
    this.drawTo(this.ctx);
  };

  /**
   * get the Tailor that the user is currently configuring
   * @return {Tailor}
   */
  Haberdashery.prototype.getActiveTailor = function() {
    return this.elements[this.index];
  };

  /**
   * redraws the composite if necessary.
   * checks if the canvas needs to be redrawn by comparing current serialized
   * state against last state.
   */
  Haberdashery.prototype.update = function() {
    var hasUnloadedImages = _.some(this.elements, function(tailor) {
      return !tailor.imgLoaded;
    });
    var serialization = this._serialize();
    if (hasUnloadedImages || this.serialization !== serialization) {
      this.serialization = serialization;
      this.drawCanvas();
    }
  };

  /**
   * serialize current state.
   * @return {string}
   */
  Haberdashery.prototype._serialize = function() {
    return _.map(this.elements, function(tailor) {
      return encodeURIComponent(tailor.name) + '=' +
             encodeURIComponent(tailor.getActiveDressingName());
    }).join('&');
  };

  /**
   * convert a serialized state into an object suitable for importing
   * @param  {string} serialization
   * @return {Object{string}} mapping of tailor names to dressing names
   */
  Haberdashery.prototype._deserialize = function(serialization) {
    var props = serialization.split('&');
    return _.reduce(props, function(map, property) {
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
  Haberdashery.prototype.export = function(asString) {
    if (asString) {
      return this._serialize();
    }
    else {
      return _.reduce(this.elements, function(props, tailor) {
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
  Haberdashery.prototype.import = Haberdashery.updatesManually(function(components) {
    if (typeof components === 'string') {
      components = this._deserialize(components);
    }
    _.each(this.elements, function(tailor) {
      var name = tailor.name;
      var dressing = _.has(components, name) ? components[name] : '';
      var i = tailor.getIndexOfDressing(dressing);
      tailor.setIndex(i);
    });
    this.update();
  });

  /**
   * get a tailor object by name
   * @param  {string} name
   * @return {Tailor|null}
   */
  Haberdashery.prototype.getTailor = function(name) {
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
  Haberdashery.prototype.setTailor = function(name) {
    if (typeof this.tailorMap[name] !== 'undefined') {
      this.setIndex(this.tailorMap[name]);
    }
  };

  /**
   * randomize all tailors' active dressings and update
   */
  Haberdashery.prototype.randomize = Haberdashery.updatesManually(function() {
    _.each(this.elements, function(tailor) {
      tailor.random();
    });
    this.update();
  });

  /**
   * set all tailors' to their default dressings (usually `blankDressing`)
   * and update
   */
  Haberdashery.prototype.clearAll = Haberdashery.updatesManually(function() {
    _.each(this.elements, function(tailor) {
      tailor.clear();
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
  Haberdashery.prototype.nth = function(n) {
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

}(r, jQuery);
