var module = angular.module('restng',[]);

// Return an object whose prototype is <object>.
function child_of(object) {
  var Surrogate = function() {};
  Surrogate.prototype = object;
  return new Surrogate();
}

// Extend function shamelessly stolen from Backbone.js:
// Helper function to correctly set up the prototype chain, for subclasses.
// Similar to `goog.inherits`, but uses a hash of prototype properties and
// class properties to be extended.
var extend = function(parent,protoProps, staticProps) {
  var child;

  // The constructor function for the new subclass is either defined by you
  // (the "constructor" property in your `extend` definition), or defaulted
  // by us to simply call the parent's constructor.
  if (protoProps && _.has(protoProps, 'constructor')) {
    child = protoProps.constructor;
  } else {
    child = function(){ return parent.apply(this, arguments); };
  }

  // Add static properties to the constructor function, if supplied.
  _.extend(child, parent, staticProps);

  // Set the prototype chain to inherit from `parent`, without calling
  // `parent`'s constructor function.
  var Surrogate = function(){ this.constructor = child; };
  Surrogate.prototype = parent.prototype;
  child.prototype = new Surrogate;

  // Add prototype properties (instance properties) to the subclass,
  // if supplied.
  if (protoProps) _.extend(child.prototype, protoProps);

  // Set a convenience property in case the parent's prototype is needed
  // later.
  child.__super__ = parent.prototype;

  return child;
};

module.factory(
  'RestNG',
  function($http,$rootScope) {
    /* The basis of RestNG is the Resource object.  Any Resource
     * object presented outside of the scope of this file is designed
     * to be an "empty shell", all of whose instance variables
     * correspond to fields that are a part of the model.  Through the
     * prototype chain, many other features are accessible.  Every
     * resource object has two semi-hidden sub-objects, _net and
     * _config.  This looks like:
     * 
     * Resource X: 
     * {
     *   id : 123
     *   name : "Daniel Staudigel"
     *   birthday : "March 26, 1987"
     *   
     *   __proto__ : { // note, __proto__ is not directly accessible in IE
     *     _net : {
     *       connected : true; // flag of whether the model has been synced to the server
     *       error : null; // non-nil string if a network error occurred
     *     },
     *     _config : {
     *       url : "/users/45"
     *     },
     *     __proto__ : ResourcePrototype
     *   }
     * }
     * 
     * Because value lookup goes up the prototype chain, you can
     * access these things easily:
     * 
     * alert(rsrcX._net.connected); // -> displays "true"
     * 
     * But when you JSON.stringify or expose the object to Angular,
     * you get something more usable:
     * 
     * { id : 123 , 
     *   name : "Daniel Staudigel" , 
     *   birthday : "March 26, 1987" }
     * 
     */

    // CreateResource creates an intermediate prototype inbetween the
    // passed-in one and the returned object.  This houses _net and
    // _config objects which are themselves prototypes to their
    // parents.  This way _net and _config behave well (inheriting
    // values from above), but are also stored out of the way of the
    // child object.  Further, modification of values inside these
    // objects works for just the one resource, without those values
    // propagating up the prototype chain.

    function CreateResourcePrototype(prototype) {
      var intermediate_resource = child_of(prototype || ResourceRootPrototype);
      
      intermediate_resource._meta = {};
      intermediate_resource._net = child_of(prototype._net);
      intermediate_resource._config = child_of(prototype._config);
      
      return intermediate_resource;
    }

    function CreateResource(prototype) {
      return child_of(CreateResourcePrototype(prototype));
    }

    function Configuration() {

    }
    Configuration.prototype = {
      baseUrl : '/',
      idAttribute : 'id',
      childPrototype : null // This must inherit from ResourceRoot
    };
    
    var rootConfig = new Configuration();

    function Net() {};
    Net.prototype = {
      reset : function() {
	delete this.error;
	delete this.errorCode;
      }
    };

    var rootNet = new Net();

    var ResourceRootPrototype = {
      __root : ResourceRootPrototype, // so it's accessible from everywhere
      _config : rootConfig,
      _net : rootNet,

      setId : function(id) {
	this[this._config.idAttribute] = id;
      },

      getId : function() {
	return this[this._config.idAttribute];
      },

      withConfig : function(callback) {
	var child = CreateResource(this);
	callback(child._config);
	return child;
      },
      
      extend : function(prototype) {
	var c = child_of(this);
	_.extend(c,prototype);
	return c;
      },

      onSyncOnce : function(callback) {
	if(this._net.active) {
	  var cbs = this._config.thenCallbacks = this._config.thenCallbacks || [];
	  cbs.push(callback);
	} else {
	  callback();
	}
      },

      onSync : function(callback) {
	var c = this._config.syncCallbacks = this._config.syncCallbacks || [];

	if(callback) {
	  c.push(callback);
	} else {
	  _.each(c,function(d) { d(); });

	  if(this._config.thenCallbacks) {
	    var cb = null;
	    while((cb = this._config.thenCallbacks.pop())) {
	      cb(this);
	    }
	  }
	}
      },
      
      url : function() {
	var id = this.getId();
	return this._config.baseUrl + (id?"/"+id:"");
      },

      one : function(path,id,prototype) {
	var child = CreateResource(this || prototype);

	child._config.baseUrl += path;
	if(id)
	  child.setId(id);
	
	return child;
      },
      
      all : function(path,prototype) {
	var p = CreateResourcePrototype(ResourceRootPrototype);
	p._config = child_of(this._config);
	var child = child_of(p);

	var url = this.url();
	if(url.length > 0 && url[url.length-1] != '/')
	  url += '/';
	
	child._config.baseUrl = url + path;
	//	alert("Createing a child ="+child._config.baseUrl);
	child._config.childPrototype = prototype || ResourceRootPrototype;

	return child;
      },

      cache : function(key,generator) {
	if(!this._meta[key]) 
	  this._meta[key] = generator.call(this);
	return this._meta[key];
      },

      _http : function(hash) {
	return $http(hash);
      },

      find : function(id) {
	// the ID Attribute in the child model:
	var idAttr = this._config.childPrototype._config.idAttribute;

	if(this[id]) {
	  return this[id];
	}

	var proto = CreateResourcePrototype(this._config.childPrototype);
	
	proto._config.baseUrl = this.url();
	
	// only create a new one if we don't have one at a
	// given ID:

	var c = this[id] || child_of(proto);

	c[idAttr] = id;

	this[id] = c;

	return c;
      },

      length : function() {
	return this._config.length;
      },
      _add : function(elem) {
	var idAttr = this._config.childPrototype._config.idAttribute;
	var id = elem[idAttr];
	
	var c = this.find(id);
	_.extend(c,elem);
      },
      _net_error : function(data,status,header,config) {
	var _net = this._net;
	var error = data;
	
	try {
	  error = angular.fromJson(data).error;
	} catch(x) {
	  error = data;
	}
	
	$rootScope.$broadcast("error","Net error : "+status+" for "+config.url);
	
	_net.errorCode = status;
	_net.error = error;
	_net.active = false;
	this.onSync();
      },
      
      del : function() {
	var that = this;
	
	var _net = this._net;
	_net.reset();
	_net.active = true;
	
	this._http({ method : "DELETE",
		     url : this.url() })
	  .success(
	    function(data,status,header,config) {
	      for(var k in this) {
		that[k] = "DELETED";
	      }
	      that.onSync();
	    }
	  )
	  .error(
	    function() { 
	      that._net_error.apply(that,arguments);
	    }
	  );
;
      },
      
      get : function() {
	var that = this;

	var _net = this._net;
	_net.reset();
	_net.active = true;
	
	this._http({ method : "GET",
		     url : this.url() })

	  .success(
	    function(data,status,header,config) {
	      _net.connected = true;
	      _net.active = false;
	      
	      if(_.isArray(data)) {
		_.each(
		  data,function(elem) {
		    that._add(elem);
		  });
		
		that._config.length = data.length;
	      } else {
		_.extend(that,data);

		$rootScope.$broadcast("client-sync");
	      }

	      that.onSync();
	    })
	  .error(function() { that._net_error.apply(that,arguments); } );

	return this;
      },

      post : function(object) {
	var that = this;

	this._http({ method : "POST",
		     url : this.url(),
		     data : JSON.stringify(object) })
	  .success(
	    function(data,status,header,config) {
	      var _net = that._net;

	      _net.connected = true;
	      _net.active = false;

	      try {
		var json = angular.fromJson(data);
		that._add(data);
	      } catch(x) {
		_net.errorCode = -1;
		_net.error = "Error parsing: "+x;
		console.error("Parse error ",x);
		_net.active = false;
		that.onSync();

		alert("Error in network proc: "+x);
	      }
	      that.onSync();
	    })
	  .error(function() { that._net_error.apply(that,arguments); } );
      },

      toJSON : function() {
	var out = {};
	_.each(this,function(value,key) {
		 if(key.indexOf('$') != 0)
		   out[key] = value;
	       });
	return out;
      },

      put : function() {
	var that = this;
	
	var _net = this._net;
	_net.reset();
	_net.active = true;

	this._http({ method : "PUT",
		     url : this.url(),
		     data : JSON.stringify(this)
		   })
	  .success(
	    function(data,status,header,config) {
	      _net.connected = true;
	      _net.active = false;
	      that.onSync();
	    })
	  .error(
	    function(data,status,header,config) {
	      that._net_error.apply(that,arguments);
	    });

	return this;
      }

    };

    return ResourceRootPrototype;
//    return { $get : function() { return ResourceRootPrototype } };
  });