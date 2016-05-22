'use strict';

/*
 * valid options:
 * * gzip_compress (string): 'no', 'always', 'auto' (default)
 * * serve_static (boolean/string): false (bool, default), true (bool), '<string>' (string with path to serve)
 * * debug (boolean): false (default) or true.
 */

(function(module) {
	var fs = require('fs');
	var path = require('path');

	var http = require('http');
	var formidable = require('formidable');
	var tiptoe = require('tiptoe');
	var zlib = require('zlib');

	var dispatch_routes = [];
	var dispatch_options = {
		gzip_compress: 'auto',
		serve_static: false,
		debug: false
	};

	var mime_types = {
		'html': 'text/html',
		'htm': 'text/html',
		'txt': 'text/plain',
		'css': 'text/css',
		'js': 'application/javascript'
	};

	// Static file root dir
	var rootDir = path.join(path.dirname(require.main.filename), 'public');

	var _debug = function() {};

	var _debugFunc = function() {
		console.log.apply(null, Array.prototype.slice.call(arguments));
	};

	var dispatch = function(port, options) {
		port = port || 3000;

		dispatch.setOptions(options);

		if (!dispatch_options.debug) _debug = function() {};

		http.createServer(dispatcher).listen(port);
	};

	/** Set individual option */
	dispatch.setOption = function(key, value) {
		dispatch_options[key] = value;

		// Setup debug
		if (dispatch_options.debug) _debug = _debugFunc;
		else _debug = function() {};
	};

	/** Set a dictionary of options */
	dispatch.setOptions = function(options) {
		Object.keys(options).forEach(function(key)  {
			dispatch.setOption(key, options[key]);
		});

		// TODO: Fix rootDir variable
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

		return(false);
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
		_debug('[dispatchjs] %s Requested: %s', req.method, req.url);

		var bindObj = function(answer, headers) {
			var compress = false;

			if (dispatch_options.gzip_compress === 'always' ||
				(bindObj.headers.hasOwnProperty('accept-encoding') && bindObj.headers['accept-encoding'].indexOf('gzip') >= 0 && dispatch_options.gzip_compress === 'auto')) {
				compress = true;
				headers['content-encoding'] = 'gzip';
			}

			if (headers)
				res.writeHead(bindObj.statusCode, headers);

			if (compress)
				zlib.gzip(answer, function(_, result) {
					res.end(result);
				})
			else
				res.end(answer);

			bindObj.dispatched = true;

			if (bindObj.cb)
				setImmediate(bindObj.cb);
		};

		bindObj.dispatch = dispatch;
		bindObj.dispatched = false;
		bindObj.fields = null;
		bindObj.files = null;
		bindObj.matches = null;
		bindObj.req = req;
		bindObj.res = res;
		bindObj.headers = parseHeaders(req.rawHeaders);
		bindObj.statusCode = 200;
		bindObj.cb = null;

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

						// Prepend '^' to every match if it's not there yet.
						if (pageMatch[0] != '^')
							pageMatch = '^' + pageMatch;

						var matches = req.url.toLowerCase().match(pageMatch);
						
						if (matches) {
							bindObj.matches = matches;
							bindObj.cb = this;
							_debug('[dispatchjs] invoking %s', JSON.stringify(currentRoute))
							setImmediate(currentRoute.callback.bind(bindObj), req, res);
							return;
						}
					}
				}

				this();
			},
			function() {
				// Dispatch static
				if (bindObj.dispatched) return(setImmediate(this));
				if (dispatch_options.serve_static === false) return(setImmediate(this));

				var reqDir = path.join(rootDir, req.url.replace(/\?.*/,''));

				serveStatic.call(bindObj, res, reqDir, this);
			},
			function(err) {
				if (err) {
					res.end('error.');
					console.error(err);
					return;
				}

				if (!bindObj.dispatched) {
					// 404 error
					var handler = dispatch_routes.find(function(x) {
						return(x.method === 404);
					});

					if (handler) {
						bindObj.statusCode = 404;
						var callable = handler.callback.bind(bindObj);
						callable(req, res);
					}
					else {
						res.writeHead(404, {'Content-Type': 'text/plain'});
						res.end('not found.');
					}
				}
			}
		);
	};

	var serveStatic = function(res, reqDir, cb) {
		var bindObj = this;

		fs.stat(reqDir, function(err, stats) {
			if (err) return(setImmediate(cb));

			if (stats.isFile()) {
				// Serve file
				fs.readFile(reqDir, function(err, buf) {
					if (err) return(setImmediate(cb, err));

					var ext = path.extname(reqDir).substr(1);
					var mime = 'text/plain';
					if (mime_types.hasOwnProperty(ext))
						mime = mime_types[ext];
					bindObj(buf, { 'Content-Type': mime });
				});
			}
			else if (stats.isDirectory()) {
				serveStatic.call(bindObj, res, path.join(reqDir, 'index.html'), cb);
			}
			else {
				setImmediate(cb);
			}
		});
	};

	dispatch.map = function(method, page, callback) {
		var obj = {};
		if (typeof(method) === 'string')
			obj.method = method.toLowerCase();
		else if (Array.isArray(method))
			obj.method = method.map(function(x) { if (typeof(x) === 'string') return(x.toLowerCase()); return(x) });
		else
			obj.method = method;

		if (typeof page === 'function' && callback === undefined) {
			callback = page;
			page = '';
		}

		obj.page = page.toLowerCase();
		obj.callback = callback;

		_debug('[dispatchjs] MAP: %s', JSON.stringify(obj));

		dispatch_routes.push(obj);
	};

	module.exports = dispatch;
})(module);
