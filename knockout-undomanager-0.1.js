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
    var lastPushedStack;
  	var STATE_DOING = 0;
  	var STATE_UNDOING = 1;
  	var STATE_REDOING = 2;
  	var state = STATE_DOING;

    var MODE_NORMAL = 0; // aggiungere allo stack normalmente
    var MODE_IGNORE = 1; // non aggiunge allo stack
    var MODE_ONCE = 2; // memorizza solo un cambiamento per la stessa proprieta
    var MODE_MERGE = 3; // fa il merge nell'ultima
    var mode = MODE_NORMAL;

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
      // durante UNDO/REDO lavoriamo sempre in normale
      if (state == STATE_UNDOING) {
        _pushInt(action, redoStack);
      } else if (state == STATE_REDOING) {
			  _pushInt(action, undoStack);
      } else if (state == STATE_DOING) {
        _pushInt(action, undoStack);
        redoStack.removeAll();
      }
  	};
  	
  	var _pushInt = function (action, myStack) {
  		/* gestione del merge di azioni: se l'ultima azione nello stack ha un metodo "mergedAction"
  		   proviamo ad invocarlo e se ci restituisce una funzione la usiamo al posto di entrambe */
      // console.log("UR", "_pushInt", myStack().length > 0 ? typeof myStack()[myStack().length - 1].mergedAction : "EMPTY");
  		if (myStack().length > 0 && typeof myStack()[myStack().length - 1].mergedAction !== 'undefined') {
		    var merged = myStack()[myStack().length - 1].mergedAction(action);
        // console.log("UR", "_pushInt.merged", merged, "MV", typeof action.mergeableMove, "MA", typeof action.mergeableAction, "MM", typeof action.mergeMe);
  		  if (merged !== null) {
    			myStack()[myStack().length - 1] = merged;
    			return;
    		}
  		}
  		if (myStack().length >= options.levels) myStack.shift();
      lastPushedStack = myStack;
  		myStack.push(action);
  	};
  	
  	var _xdoCommand = function(label, workState, stack) {
  		return {
  			name: ko.computed(function() {
  				return label.replace(/#COUNT#/, stack().length);
  			}),
  			enabled: ko.computed(function() {
  				return stack().length !== 0;
  			}),
  			execute: function() {
  				var action = stack.pop();
  				if (action) {
  					var prevState = state;
  					state = workState;
            var oldMode = mode;
            mode = MODE_MERGE;
            // console.log("XDO", "before", label);
  					action();
            // console.log("XDO", "after", label);
            _removeMergedAction(lastPushedStack);
            mode = oldMode;
  					state = prevState;
  				}
  				return true;
  			}
  		};
  	};

    var _removeMergedAction = function(myStack) {
      if (typeof myStack == 'undefined') throw "Unexpected operation: stack cleaner called with undefined stack";
      
      if (myStack().length > 0 && typeof myStack()[myStack().length - 1].mergedAction !== 'undefined') {
        // console.log("Removing mergedAction from stack");
        delete myStack()[myStack().length - 1].mergedAction;
      }
    };

    var _combinedFunction = function(first, second) {
      var res = (function(f1, f2) {
        f1();
        f2();
      }).bind(undefined, first, second);
      if (typeof first.mergedAction !== 'undefined') {
        res.mergedAction = first.mergedAction;
      }
      return res;
    };
  	
    var makeUndoAction = function(parents, child, item) {
      var act;
      if (child.oldValues) {
        act = child.bind(child, child.oldValues[0]);
      } else if (item) {
        if (item.status == 'deleted') {
          act = child.splice.bind(child, item.index, 0, item.value);
        } else if (item.status == 'added') {
          act = child.splice.bind(child, item.index, 1);
        } else {
          throw "Unsupproted item.status: "+item.status;
        }
      } else {
        throw "Unexpected condition: no item and no child.oldValues!";
      }
      return act;
    };

    var changePusher = function(parents, child, item) {
      // console.log("UM", mode, typeof child.oldValues, typeof item);

      if (mode == MODE_IGNORE) return;

      var act;

      if (mode == MODE_MERGE) {
        // console.log("UR", "mergemode");
        act = makeUndoAction(parents, child, item);
        act.mergedAction = function(newAction) {
          if (typeof newAction.mergeMe !== 'undefined' && newAction.mergeMe) {
            return _combinedFunction(newAction, this);
          } else return null;
        };
        act.mergeMe = true;
      } else {
        act = makeUndoAction(parents, child, item);
        if (child.oldValues && mode == MODE_ONCE) {
          act.mergedAction = function(oldChild, oldItem, newAction) {
            if (typeof newAction.mergeableAction == 'object' && oldChild == newAction.mergeableAction.child) {
              // console.log("UR", "ignore update for property in MODE_ONCE");
              return this;
            } else return null;
          }.bind(act, child, item);
          act.mergeableAction = { child: child, item: item };
        }
        // console.log("UR", "item.status", item.status);
      	// "item" is valued when an item is added/removed/reteined in an array
      	// sometimes KO detect "moves" and add a "moved" property with the index but
      	// this doesn't happen for example using knockout-sortable or when moving objects
      	// between arrays.
      	// So this ends up handling this with "mergeableMove" and "mergedAction": 
      	if (item && item.status == 'deleted') {
          // TODO se sono in MODE = MERGE devo metteer una funzione di merge che accetta tutto.
          // altrimenti lascio questa.
      		act.mergedAction = function(oldChild, oldItem, newAction) {
            // console.log("UR", "act.mergedAction", typeof newAction.mergeableMove);
      	    // a deleted action is able to merge with a added action if they apply to the same
      	    // object.
      			if (typeof newAction.mergeableMove == 'object' && oldItem.value == newAction.mergeableMove.item.value) {
      				// in this case I simply return a single action running both actions in sequence,
      				// this way the "undo" will need to undo only once for a "move" operation.
      				return _combinedFunction(newAction, this);
      			} else {
              console.log("UR", "not mergeable", typeof newAction.mergeableMove);
            }

      			return null;
      		}.bind(act, child, item);
      	}
        if (item && item.status == 'added') {
      		// add a mergeableMove property that will be used by the next action "mergedAction" to see if this action
      		// can be merged.
      		act.mergeableMove = { child: child, item: item };
        }
      }
      _push(act);
    };

    ko.watch(model, { depth: -1, keepOldValues: 1, mutable: true }, changePusher);

		return {
			push: _push, 
			undoCommand: _xdoCommand(options.undoLabel, STATE_UNDOING, undoStack),
			redoCommand: _xdoCommand(options.redoLabel, STATE_REDOING, redoStack),
			reset: function() { undoStack.removeAll(); redoStack.removeAll(); },
      setMode: function(newMode) { mode = newMode; _removeMergedAction(undoStack); }
		};
  };
  
}));