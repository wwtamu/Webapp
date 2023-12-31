/**
 * @ngdoc service
 * @name  core.service:AlertService
 * @requires ng.$q
 * @requires ng.$interval
 *
 * @description
 * 	Alert service which tracks responses from the web socket API.
 * 	Stores responses categorized by type, controller, or endpoint. The id is popped 
 * 	from an array of keys(sequential integers) and recycled upon removal
 * 	of the alert. Old alerts removed using an interval.
 *
 */
webapp.service("AlertService", function($q, $interval, $timeout) {

	var AlertService = this;
	
	/**
	 * @ngdoc property
	 * @name  core.service:AlertService#types
	 * @propertyOf core.service:AlertService
	 *
	 * @description 
	 *  The available alert types. These are declared in the
	 *  {@link config config}
	 * 
	 */
	var types = config.alerts.types;

	/**
	 * @ngdoc property
	 * @name  core.service:AlertService#classes
	 * @propertyOf core.service:AlertService
	 *
	 * @description 
	 *  The classes to be apploed to each alert type. These are declared in the
	 *  {@link config config}
	 * 
	 */
	var classes = config.alerts.classes;

	/**
	 * @ngdoc property
	 * @name  core.service:AlertService#store
	 * @propertyOf core.service:AlertService
	 *
	 * @description 
	 *  An object to store alerts.
	 * 
	 */
	var store = {};
	
	// create stores for the types
	for(var i in types) {
		store[types[i]] = {
			defer: $q.defer(),
			list: []
		};
	}
	
	/**
	 * @ngdoc property
	 * @name  core.service:AlertService#queue
	 * @propertyOf core.service:AlertService
	 *
	 * @description 
	 *  An object to store queues.
	 * 
	 */
	var queue = {};
	
	/**
	 * @ngdoc property
	 * @name  core.service:AlertService#exclusive
	 * @propertyOf core.service:AlertService
	 *
	 * @description 
	 *  An array of exclusive channels.
	 * 
	 */
	var exclusive = [];
	
	/**
	 * @ngdoc property
	 * @name  core.service:AlertService#keys
	 * @propertyOf core.service:AlertService
	 *
	 * @description 
	 *  An array of available keys.
	 * 
	 */
	var keys = [];

	// create the initial keys
	for(var id = 0; id < 1000; id++) {
		keys.push(id);
	}

	/**
	 * @ngdoc method
	 * @name  core.service:AlertService#Alert
	 * @methodOf core.service:AlertService
	 * @param {string} message 
	 * 	message on the API response
	 * @param {string} type 
	 * 	mapped response type on the API response
	 * @param {string} channel 
	 * 	channel on which the response returned
	 * @returns {Alert} returns a new Alert.
	 *
	 * @description
	 * 	Constructor for an Alert.
	 */
	var Alert = function(message, type, channel) {
		this.id = keys.pop();
		this.message = message ? message : '';
		this.type = type ? type : 'UNKNOWN';
		this.channel = channel ? channel : 'unassigned';
		this.time = new Date().getTime();
		if(typeof classes[type] == 'undefined') {
			this.class = classes['DEFAULT'];
		}
		else {
			this.class = classes[type];
		}
		return this;
	};
	
	/**
	 * @ngdoc method
	 * @name  core.service:AlertService#AlertService.create
	 * @methodOf core.service:AlertService
	 * @param {string} facet
	 *  either type, controller, or endpoint
	 * 
	 * @description
	 *  Method to create a store with the given facet.
	 *	 
	 */
	AlertService.create = function(facet, exclusion) {
		if(typeof store[facet] != 'undefined') return;
		store[facet] = {
			defer: $q.defer(),
			list: []
		};
		if(exclusion) {
			exclusive.push(facet);
		}
		if(typeof queue[facet] != 'undefined') {
			for(var i in queue[facet]) {
				AlertService.add(queue[facet][i].meta, queue[facet][i].channel);
			}
			delete queue[facet];
		}
	};

	/**
	 * @ngdoc method
	 * @name  core.service:AlertService#AlertService.get
	 * @methodOf core.service:AlertService
	 * @param {string} facet
	 *  either type, controller, or endpoint
	 * @return {object} 
	 *  returns store object containing promise and current list of alerts
	 * 
	 * @description 
	 *  Method to get a store from the alert service.
	 *  A store consists of the promise and a list of alerts.
	 *  
	 */
	AlertService.get = function(facet) {
		if(typeof facet == 'undefined') return [];
		return store[facet];
	};
	
	/**
     * @ngdoc property
     * @name core.directive:alerts#firstPass
     * @propertyOf core.directive:alerts
     *
     * @description
     * A variable to allow time to initialize before adding to type stores.
     */
	var initializing = true;

	/**
	 * @ngdoc method
	 * @name  core.service:AlertService#add
	 * @methodOf core.service:AlertService
	 * @param {string} facet
	 *  An facet of a type, channel, or endpoint.
	 * @param {object} meta
	 *  An API response meta containing message and type.
	 * @param {string} channel
	 *  The channel on which the response returned.
	 *
	 * @description 
	 *  Method to check store for facet and either add if not already in store
	 *  or add to the queue 
	 * 
	 */
	var add = function(facet, meta, channel) {		
		var alert = new Alert(meta.message, meta.type, channel);		
		if(typeof store[facet] != 'undefined') {
			// add alert to store by facet
			if(isNotStored(facet, meta, channel)) {
				store[facet].list.push(alert);
				store[facet].defer.notify(alert);
			}
		}
		else {
			// queue alert
			enqueue(facet, meta, channel);
		}
	};
	
	/**
	 * @ngdoc method
	 * @name  core.service:AlertService#AlertService.add
	 * @methodOf core.service:AlertService
	 * @param {object} meta
	 *  An API response meta containing message and type.
	 * @param {string} channel
	 *  The channel on which the response returned.
	 *
	 * @description 
	 *  Method to add an alert to the appropriate stores.
	 *  Adds to both the store for type and store for channel. 
	 * 
	 */
	AlertService.add = function(meta, channel) {
		
		if(typeof channel != 'undefined') {
			var endpoint = channel;
			
			// add alert to store by endpoint
			add(endpoint, meta, channel);
			
			// return if endpoint is exclusive
			if(exclusive.indexOf(endpoint) > -1) {
				return;
			}
			
			var controller = channel.substr(0, channel.lastIndexOf("/"));
			
			// add alert to store by controller
			add(controller, meta, channel);
			
			// return if controller is exclusive
			if(exclusive.indexOf(controller) > -1) {
				return;
			}
		}
		
		// allow time for any exclusive channels to be created 
		// before adding to stores by type
		if(initializing) {
			$timeout(function() {
				initializing = false;
				AlertService.add(meta, channel);
			}, 2500);			
			return;
		}

		// add alert to store by type
		add(meta.type, meta, channel);
	};
	
	/**
	 * @ngdoc method
	 * @name  core.service:AlertService#remove
	 * @methodOf core.service:AlertService
	 * @param {string} facet
	 *  An facet of a type, channel, or endpoint
	 * @param {object} alert
	 *  The Alert to be removed.
	 *  
	 * @description 
	 *  Method to remove alert from all store by facet.
	 * 
	 */
	var remove = function(facet, alert) {
		if(typeof store[facet] != 'undefined') {
			for(var i in store[facet].list) {
				if(store[facet].list[i].id == alert.id) {
					store[facet].defer.notify(alert);
					store[facet].list.splice(i, 1);
					break;
				}
			}
		}
	};
	
	/**
	 * @ngdoc method
	 * @name  core.service:AlertService#AlertService.remove
	 * @methodOf core.service:AlertService
	 * @param {object} alert
	 *  The Alert to be removed.
	 *
	 * @description 
	 *  Method to remove an alert from the store.
	 *  Removes from both type store, controller store, and endpoint store.
	 * 
	 */
	AlertService.remove = function(alert) {
		
		console.log(alert);
		alert.remove = true;
							
		// remove alert from store by type
		remove(alert.type, alert);
		
		var endpoint = alert.channel;
		
		// remove alert from store by endpoint
		remove(endpoint, alert);

		var controller = alert.channel.substr(0, alert.channel.lastIndexOf("/"));
		
		// remove alert from store by controller 
		remove(controller, alert);

		keys.push(alert.id);
	};
	
	/**
	 * @ngdoc method
	 * @name  core.service:AlertService#enqueue
	 * @methodOf core.service:AlertService
	 * @param {string} facet
	 *  type, controller, or endpoint
	 * @param {object} meta
	 *  API response meta containing type and message
	 * @param {string} channel
	 *  on which the response returned
	 * @return {array} returns array of duplicates with specified values
	 *
	 * @description
	 *  Enqueue alert if not already queued.
	 * 
	 */
	var enqueue = function(facet, meta, channel) {		
		if(isNotQueued(facet, meta, channel)) {
			queue[facet].push({
				'meta': meta,
				'channel': channel
			})
		}
	};
	
	/**
	 * @ngdoc method
	 * @name  core.service:AlertService#isNotQueued
	 * @methodOf core.service:AlertService
	 * @param {string} facet
	 *  type, controller, or endpoint
	 * @param {object} meta
	 *  API response meta containing type and message
	 * @param {string} channel
	 *  on which the response returned
	 * @return {array} returns array of duplicates with specified values
	 *
	 * @description
	 *  Method to check to see if queue does not contain
	 *  alert with same type, message, and channel.
	 * 
	 */
	var isNotQueued = function(facet, meta, channel) {
		if(typeof queue[facet] == 'undefined') {
			queue[facet] = [];
			return true;
		}
		var queued = queue[facet].filter(function(alert) {
			return alert.meta.type == meta.type &&
			   	   alert.meta.message == meta.message &&
			   	   alert.channel == channel;
		});
		return queued.length == 0;
	}
	
	/**
	 * @ngdoc method
	 * @name  core.service:AlertService#isNotStored
	 * @methodOf core.service:AlertService
	 * @param {string} facet
	 *  type, controller, or endpoint
	 * @param {object} meta
	 *  API response meta containing type and message
	 * @param {string} channel
	 *  on which the response returned
	 * @return {array} returns array of duplicates with specified values
	 *
	 * @description
	 *  Method to check to see if store does not contain
	 *  alert with same type, message, and channel.
	 * 
	 */
	var isNotStored = function(facet, meta, channel) {
		var list = store[facet].list.filter(function(alert) {
			var channelMatch = typeof channel != 'undefined' ? alert.channel == channel : true;
			return alert.type == meta.type &&
			   	   alert.message == meta.message &&
			       channelMatch;
		});
		return list.length == 0;
	};
		
	// remove old alerts and recycle keys
	$interval(function() {
		var now = new Date().getTime();
		
		var recycle = [];
		
		for(var t in store) {
			// do not flush errors
			if(t != 'ERROR') {			
				for(var j = store[t].list.length-1; j >= 0; j--) {
					
					var alert = store[t].list[j];
				
					if(alert.time < now - (config.alerts.flush/2)) {
						
						alert.remove = true;
						
						store[t].defer.notify(alert);
						store[t].list.splice(j, 1);
						
						// don't recycle the same id twice
						if(recycle.indexOf(alert.id) < 0) {
							recycle.push(alert.id);
						}
					}
				}
			}
		}
		
		keys = keys.concat(recycle);
		
	}, config.alerts.flush);
							
});
