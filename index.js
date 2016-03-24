'use strict';

/*
 * valid options:
 * * gzip_compress (string): 'no', 'always', 'auto' (default)
 */

(function(module) {
	var http = require('http');
	var formidable = require('formidable');
	var tiptoe = require('tiptoe');
	var zlib = require('zlib');

	var dispatch_routes = [];
	var dispatch_options = {
		gzip_compress: 'auto'
	};

	var dispatch = function(port, options) {
		port = port || 3000;

		if (options) {
			dispatch_options = options;
			// Default options
			if (!dispatch_options.hasOwnProperty('gzip_compress'))
				dispatch_options.gzip_compress = 'auto';
		}


		http.createServer(dispatcher).listen(port);
	};

	dispatch.version = '1.1.0';

	/** Check if the given 'methods' object matches the requested Method.
	 */
	var matchMethod = function(reqMethod, methods) {
		var singleMatch = function(method) {
			if (typeof(method) !== 'string') {
				return(false);
			}

			if (method === '*')
				return(true);

			if (reqMethod === method) {
				return(true);
			}

			return(false);
		};

		if (typeof(reqMethod) !== 'string')
			return(false);

		reqMethod = reqMethod.toLowerCase();

		if (typeof(methods) === 'string')
			return(singleMatch(methods));

		if (Array.isArray(methods)) {
			var i, l = methods.length;
			for (i = 0; i < l; i++) {
				if (singleMatch(methods[i]))
					return(true);
			}
		}

		return(ret);
	};

	/**
	 * Parse the headers into a understandable and easy-to-use format
	 */
	var parseHeaders = function(rawHeaders) {
		var ret = {};
		var i = 0;

		for (i = 0; i < rawHeaders.length; i++) {
			var headerName = rawHeaders[i++].toLowerCase();
			var content = rawHeaders[i].toLowerCase();

			if (ret.hasOwnProperty(headerName)) {
				var oldContent = ret[headerName];
				if (!Array.isArray(oldContent)) {
					oldContent = [ oldContent ];
				}

				oldContent.push(content);
				content = oldContent;
			}

			ret[headerName] = content;
		}

		return(ret);
	};

	/**
	 * Function called by every server request
	 */
	var dispatcher = function(req, res) {
		//console.log("[%s] Requested: %s", req.method, req.url);
		var dispatched = false;

		var bindObj = function(answer, headers) {
			var compress = false;

			if (dispatch_options.gzip_compress === 'always' ||
				(bindObj.headers.hasOwnProperty('accept-encoding') && bindObj.headers['accept-encoding'].indexOf('gzip') >= 0 && dispatch_options.gzip_compress === 'auto')) {
				compress = true;
				headers['content-encoding'] = 'gzip';
			}

			if (headers)
				res.writeHead(200, headers);

			if (compress)
				zlib.gzip(answer, function(_, result) {
					res.end(result);
				})
			else
				res.end(answer);
		};

		bindObj.dispatch = dispatch;
		bindObj.fields = null;
		bindObj.files = null;
		bindObj.matches = null;
		bindObj.req = req;
		bindObj.res = res;
		bindObj.headers = parseHeaders(req.rawHeaders);

		tiptoe(
			function() {
				if (req.method.toLowerCase() === 'post') {
					var form = new formidable.IncomingForm();
					form.parse(req, this);
				}
				else {
					this();
				}
			},
			function(fields, files) {
				// Prepare bindObj

				if (fields)
					bindObj.fields = fields;

				if (files)
					bindObj.files = files;

				this();
			},
			function() {
				// Find and call method
				var i, l = dispatch_routes.length;

				for (i = 0; i < l; i++) {
					var currentRoute = dispatch_routes[i];
					if (matchMethod(req.method.toLowerCase(), currentRoute.method)) {
						var pageMatch = currentRoute.page;
						if (pageMatch[0] != '^')
							pageMatch = '^' + pageMatch;

						var matches = req.url.toLowerCase().match(pageMatch);
						
						if (matches) {
							// Don't throw a 404
							dispatched = true;
							return(setImmediate(function() {
								bindObj.matches = matches;
								var callable = currentRoute.callback.bind(bindObj);
								callable(req, res);
							}));
						}
					}
				}

				this();
			},
			function(err) {
				if (err) {
					req.end('error.');
				}

				if (!dispatched) {
					res.writeHead(404, {'Content-Type': 'text/plain'});
					res.end('not found.');
				}
			}
		);

	};

	dispatch.map = function(method, page, callback) {
		var obj = {};
		if (typeof(method) === 'string')
			obj.method = method.toLowerCase();
		else if (Array.isArray(method))
			obj.method = method.map(function(x) { if (typeof(x) === 'string') return(x.toLowerCase()); return(x) });
		else
			obj.method = method;

		obj.page = page.toLowerCase();
		obj.callback = callback;

		console.log(obj);

		dispatch_routes.push(obj);
	};

	module.exports = dispatch;
})(module);
