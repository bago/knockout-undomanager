// Knockout UndoManager v0.1 | (c) 2014 Stefano Bagnara
// License: MIT (http://www.opensource.org/licenses/mit-license) 
// requires "ko.watch" method from knockout.reactor-1.2.0-beta.js
(function (factory) {
	// Module systems magic dance.

	if (typeof require === "function" && typeof exports === "object" && typeof module === "object") {
		// CommonJS or Node: hard-coded dependency on "knockout"
		factory(require("knockout"), exports);
	} else if (typeof define === "function" && define["amd"]) {
		// AMD anonymous module with hard-coded dependency on "knockout"
		define(["knockout", "exports"], factory);
	} else {
		// <script> tag: use the global `ko` object
		factory(ko, ko);
	}
}(function (ko, exports) { 
	
  /// <summary>
  ///     Track last "levels" changes within the chained observable down to any given level and
  ///     supports undoing/redoing the changes.
  /// </summary>
  /// <param name="options" type="object">
  ///     { levels: 2 } -> Remember only last "levels" changes<br/>
  ///     { undoLabel: "Undo it (#COUNT)!" } -> Define a label for the undo command. "#COUNT#" sequence will be replaced with the stack length.<br/>
  ///     { redoLabel: "Redo it (#COUNT)!" } -> Define a label for the redo command. "#COUNT#" sequence will be replaced with the stack length.<br/>
  /// </param>
  exports.undoManager = function (model, options) {
  	var undoStack = ko.observableArray();
  	var redoStack = ko.observableArray();
  	var STATE_DOING = 0;
  	var STATE_UNDOING = 1;
  	var STATE_REDOING = 2;
  	var state = STATE_DOING;
  	
  	var defaultOptions = {
  		levels: 100,
  		undoLabel: "undo (#COUNT#)",
  		redoLabel: "redo (#COUNT#)"
  	};
  	
    if (typeof options == 'object') {
      options = ko.utils.extend(defaultOptions, options);
    } else {
      options = defaultOptions;
    }
	
  	var _push = function (action) {
  		if (state != STATE_UNDOING) {
			  _pushInt(action, undoStack);
			  if (state == STATE_DOING) redoStack.removeAll();
  		} else {
  			_pushInt(action, redoStack);
  		}
  	};
  	
  	var _pushInt = function (action, myStack) {
  		/* gestione del merge di azioni: se l'ultima azione nello stack ha un metodo "mergedAction"
  		   proviamo ad invocarlo e se ci restituisce una funzione la usiamo al posto di entrambe */
  		if (myStack().length > 0 && myStack()[myStack().length - 1].mergedAction != undefined) {
		    var merged = myStack()[myStack().length - 1].mergedAction(action);
  		  if (merged != null) {
    			myStack()[myStack().length - 1] = merged;
    			return;
    		}
  		}
  		if (myStack().length >= options.levels) myStack.shift();
  		myStack.push(action);
  	};
  	
  	var _xdoCommand = function(label, workState, stack) {
  		return {
  			name: ko.computed(function() {
  				return label.replace(/#COUNT#/, stack().length);
  			}),
  			enabled: ko.computed(function() {
  				return stack().length != 0;
  			}),
  			execute: function() {
  				var action = stack.pop();
  				if (action) {
  					var prevState = state;
  					state = workState;
  					action();
  					state = prevState;
  				}
  				return true;
  			}
  		}
  	};
  	
    ko.watch(model, { depth: -1, keepOldValues: 1, mutable: true }, function(stackpush, parents, child, item) {
    	if (child.oldValues) {
      	stackpush(child.bind(child, child.oldValues[0]));
      } else if (item) {
      	// "item" is valued when an item is added/removed/reteined in an array
      	// sometimes KO detect "moves" and add a "moved" property with the index but
      	// this doesn't happen for example using knockout-sortable or when moving objects
      	// between arrays.
      	// So this ends up handling this with "mergeableMove" and "mergedAction": 
      	if (item.status == 'deleted') {
      		var act = child.splice.bind(child, item.index, 0, item.value);
      		act.mergedAction = function(oldChild, oldItem, newAction) {
      	    // a deleted action is able to merge with a added action if they apply to the same
      	    // object.
      			if (typeof newAction.mergeableMove == 'object' && oldItem.value == newAction.mergeableMove.item.value) {
      				// in this case I simply return a single action running both actions in sequence,
      				// this way the "undo" will need to undo only once for a "move" operation.
      				return (function(funcs) {
      			  	for (var i = 0; i < funcs.length; i++) funcs[i]();
      			  }).bind(this, [newAction, this]);
      			}
      			return null;
      		}.bind(act, child, item);
      		stackpush(act);
      	} else if (item.status == 'added') {
      		var act = child.splice.bind(child, item.index, 1);
      		// add a mergeableMove property that will be used by the next action "mergedAction" to see if this action
      		// can be merged.
      		act.mergeableMove = { child: child, item: item };
      		stackpush(act);
      	}
      }
    }.bind(this, _push));

		return {
			push: _push, 
			undoCommand: _xdoCommand(options.undoLabel, STATE_UNDOING, undoStack),
			redoCommand: _xdoCommand(options.redoLabel, STATE_REDOING, redoStack),
			reset: function() { undoStack.removeAll(); redoStack.removeAll(); }
		};
  };
  
}));