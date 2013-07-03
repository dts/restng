describe(
  "RestNG", function() {
    // API
    var RestNG, $httpBackend;

    // Load required modules
//    beforeEach(angular.mock.module("$http"));
    beforeEach(angular.mock.module("restng"));

    // Init HTTP mock backend and Restangular resources
    beforeEach(
      inject(
	function($injector) {
	  RestNG = $injector.get("RestNG");
	  $httpBackend = $injector.get("$httpBackend");
	  
	  var client_abc123 = {
	    id : "abc123",
	    name : "Martin"
	  };
	    
	  $httpBackend.whenGET("/clients/abc123").respond(200,JSON.stringify(client_abc123),'');
	  $httpBackend.whenGET("/clients/abc125").respond(404,JSON.stringify({ error : "Not found" }),'');
	  $httpBackend.whenPUT("/clients/abc125").respond(
	    function(method, url, data, headers) {
	      var data_json = JSON.parse(data);
	      if(data_json.field1 == "value1" &&
		 data_json.field2 == "value2") {
		return [200,data,''];
	      } else {
		return [404,{ error : "invalid stuff" },''];
	      }
	    });

	  $httpBackend.whenGET("/channels").respond(200,[ { id : 1 , name : "Channel 1" },
							  { id : 2 , name : "Channel 2" } ],'');

	  $httpBackend.whenPUT("/channels/1").respond(
	    function(method,url,data,headers) {
	      var data_json = angular.fromJson(data);
	      if(data_json.name == "Do the thing") {
		return [200,data_json,''];
	      } else {
		return [500,{ error : "Invalid put" },''];
	      }
	    });
	}));
    
    afterEach(
      function() {
	$httpBackend.verifyNoOutstandingExpectation();
	$httpBackend.verifyNoOutstandingRequest();
      });


    // The actual tests!

    describe(
      "CONFIGURATION",function() {
	it("should start at URI '/'",
	   function() {
	     expect(RestNG.url()).toEqual('/');
	   }
	  );

	it("should be configurable to a different URI",
	   function() {
	     var new_uri = '/api/v1';
	     var new_one = RestNG.withConfig(
	       function(c) { c.baseUrl = new_uri; }
	     );
	     
	     expect(new_one.url()).toEqual(new_uri);
	   });

	it("Should have a _net and _config objects",
	   function() {
	     expect(RestNG._net).not.toBe(undefined);
	     expect(RestNG._config).not.toBe(undefined);
	   });
      });


    describe(
      "ONE",
      function() {
	it("should point to the correct URI",
	   function() {
	     var client = RestNG.one("clients","abc123");
	     expect(client.url()).toEqual("/clients/abc123");
	   });

	it('should request the correct URI',
	   function() {
	     var client;
	     
	     runs(function() {
		    client = RestNG.one("clients","abc123").get();
		    $httpBackend.flush();
		    expect(client._net).toBeDefined();
		    expect(client).not.toBe(null);
		  });

	     waitsFor(function() {
//			console.log("client.error : "+client._net.error);
			return client._net.connected;
		      });
	     
	     runs(function() {
		    expect(client.id).toEqual("abc123");
		    expect(client.name).not.toBe(null);
		  });
	   });




	it('should deal with a 404 correct',
	   function() {
	     var client;
	     
	     runs(function() {
		    client = RestNG.one("clients","abc125").get();
		    $httpBackend.flush();
		    expect(client._net).toBeDefined();
		    expect(client).not.toBe(null);
		  });

	     waitsFor(function() {
			return !!(client._net.error);
		      });
	     
	     runs(function() {
		    expect(client.id).toEqual("abc125");
		    expect(client.name).toBeUndefined();
		    expect(client._net.errorCode).toBe(404);
		  });
	   });







	it('should be able to put new details',
	   function() {
	     var client;
	     
	     runs(function() {
		    client = RestNG.one("clients","abc125");
		    client.field1 = "value1";
		    client.field2 = "value2";
		    client = client.put();
		    $httpBackend.flush();
		    expect(client._net).toBeDefined();
		    expect(client).not.toBe(null);
		  });

	     waitsFor(function() {
			return client._net.connected || !!(client._net.error);
		      });
	     
	     runs(function() {
		    expect(client._net.error).toBeUndefined();
		  });
	   });






	it('should get an array and represent it with the prototype available',
	   function() {
	     var channels,channel;
	     var ChannelProto = RestNG.extend(
	       {
		 doSomething : function() {
		   return this.id;
		 }
	       });

	     runs(function() {
		    channels = RestNG.all('channels',ChannelProto).get();
		    $httpBackend.flush();
		  });

	     waitsFor(function() {
			return channels._net.connected || !!(channels._net.error);
		      });

	     runs(function() {
		    expect(channels.length()).toBeDefined();
		    // check to make sure they do the right thing:
		    expect(channels[1].doSomething()).toBe(1);
		    expect(channels[2].doSomething()).toBe(2);

		    // make sure they only have two keys: (two elements, two keys each)
		    expect(_.keys(channels).length).toBe(2);
		    expect(_.keys(channels[1]).length).toBe(2);

		    // keep testing, now we should be able to push a change:
		    channel = channels[1];
		    channel.name = "Do the thing";
		    channel.put();

		    $httpBackend.flush();
		  });

	     waitsFor(function() {
			return !channel._net.active;
		      });

	     runs(function() {
		    expect(channel._net.error).not.toBeDefined();
		  });
	     
	   });

	it('should properly handle then()',
	   function() {
	     var channel;
	     var then_callback = jasmine.createSpy();

	     runs(function() {
		    channel = RestNG.all('channels').get();
		    channel.then(then_callback);
		    $httpBackend.flush();
		  });
	     
	     waitsFor(function() {
			return !channel._net.active;
		      });

	     runs(function() {
		    expect(then_callback).toHaveBeenCalled();
		  });
	   });

      });
  });