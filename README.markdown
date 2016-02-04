DispatchJS
=========

A very simple dispatcher for nodejs servers.

Sample usage:
```javascript
var dispatch = require('dispatchjs');

dispatch.map('GET', '^/?$', function() {
	this('Hello world!', { 'Content-Type': 'text/plain' });
});

dispatch.map('POST', '/upload', function() {
	console.log(this.files);
	this('Thank you.');
});

dispatch();
```

Methods
------

```javascript
dispatch.map(METHODS, REGEX, CALLBACK);
```

**METHODS** are the names of the *HTTP METHOD* you want to respond to. It can be an array with the list of methods or a string for a single type of method. Most common methods are 'GET' and 'POST'. You can use '*' to describe any method.

**REGEX** is the page to respond to. It will be matched using the nodejs [String.match()](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/String/match) function. The '^' is automatically prepended to the regex if none is provided. No '$' are automatically added.

If a match is found, the function gets called and the matches will be available at `this.matches` variable.

**CALLBACK** is the function to call if the *METHOD* and *REGEX* are valid. To the function are passed the parameters `req` and `res`, like `function(req, res) {}`. But they also can be accessed within the function as `this.req` and `this.res`.

**this** is an auxiliary function to respond to the request. It ends the connection on calling and no further information can be sent to the client.

format: `this(DATA [, HEADERS]);`

variables:
* `this.ret`
* `this.req`
* `this.matches`
* `this.dispatch` -- the main Dispatch function
* `this.fields` -- if it's a POST method, it parses the fields of the form, if any (using *formidable*).
* `this.files` -- uploaded files, if any (using *formidable*).

```javascript
dispatch([PORT]);
```

Invokes the http server and start serving on the given *PORT*. Default port value is 3000.

License
------

[MIT](https://opensource.org/licenses/MIT)