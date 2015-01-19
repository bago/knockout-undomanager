// Knockout UndoManager v0.2-beta | (c) 2014 Stefano Bagnara
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

    var MODE_NORMAL = 0; // add to stack every change
    var MODE_IGNORE = 1; // do not add anything to the stack
    var MODE_ONCE = 2; // only one sequential change for each property is added to the stack
    var MODE_MERGE = 3; // merge next change with the last one
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
  	
    var _tryMerge = function (prev, newAction) {
      if (typeof prev.mergedAction !== 'undefined') {
        return prev.mergedAction(newAction);
      } else return null;
    };

  	var _pushInt = function (action, myStack) {
  		/* gestione del merge di azioni: se l'ultima azione nello stack ha un metodo "mergedAction"
  		   proviamo ad invocarlo e se ci restituisce una funzione la usiamo al posto di entrambe */
      // console.log("UR", "_pushInt", myStack().length > 0 ? typeof myStack()[myStack().length - 1].mergedAction : "EMPTY");
  		if (myStack().length > 0) {
		    var merged = _tryMerge(myStack()[myStack().length - 1], action);
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
  	
    var _reference = function(model, path) {
      var p = 0;
      var p1, p2;
      var m = model;
      while (p < path.length) {
        switch (path.charAt(p)) {
          case '(': 
            if (path.charAt(p + 1) == ')') {
              m = m();
            } else {
              // TODO error
            }
            p += 2;
            break;
          case '[':
            p2 = path.indexOf(']', p);
            m = m[path.substring(p + 1, p2)];
            p = p2 + 1;
            break;
          case '.':
            p1 = path.indexOf('(', p);
            if (p1 == -1) p1 = path.length;
            p2 = path.indexOf('[', p);
            if (p2 == -1) p2 = path.length;
            p2 = Math.min(p1, p2);
            m = m[path.substring(p + 1, p2)];
            p = p2;
            break;
          default: 
            // TODO error
        }
      }
      return m;
    };

    var makeDereferencedUndoAction = function(model, path, value, item) {
      var child = _reference(model, path);
      // console.log("ACT", path, value, item);
      if (value) {
        child(value);
      } else if (item) {
        if (item.status == 'deleted') {
          child.splice(item.index, 0, item.value);
        } else if (item.status == 'added') {
          child.splice(item.index, 1);
        } else {
          throw "Unsupproted item.status: "+item.status;
        }
      } else {
        throw "Unexpected condition: no item and no child.oldValues!";
      }
    };

    /* dereferencing path and changing value with "toJS" */
    var makeUndoActionDereferenced = function(parents, child, item) {
      var oldVal = typeof child.oldValues != 'undefined' ? child.oldValues[0] : undefined;
      // TODO questa parte "ko.toJS" dovrebbe essere resa pluggabile
      // TODO per poter serializzare l'intero stack dovrei cambiare architettura e tenere
      // oggetti serializzabili invece di funzioni.
      // if (typeof oldVal === 'object' || typeof oldVal === 'function') oldVal = ko.toJS(oldVal);
      // if (typeof item !== 'undefined' && (typeof item.value === 'object' || typeof item.value === 'function')) item.value = ko.toJS(item.value);
      try {
        var path = _getPath(parents, child);
        return makeDereferencedUndoAction.bind(undefined, model, path, oldVal, item);
      } catch (e) {
        console.log("TODO Exception processing undo", e, parents, child, item);
      }
    };

    var makeUndoActionDefault = function(parents, child, item) {
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

    var makeUndoAction = makeUndoActionDefault;

    var _getPath = function(parents, child) {
      var path = "";
      var p;
      for (var k = 0; k <= parents.length; k++) {
        p = k < parents.length ? parents[k] : child;
        if (ko.isObservable(p)) path += '()';
        if (typeof p._fieldName !== 'undefined') {
          path += "."+p._fieldName;
        } else if (k > 0 && typeof parents[k - 1].pop == 'function') {
          var parentArray = ko.isObservable(parents[k - 1]) ? ko.utils.peekObservable(parents[k - 1]) : parents[k - 1];
          var pos = ko.utils.arrayIndexOf(parentArray, p);
          if (pos != -1) {
            path += "["+pos+"]";
          } else {
            // TODO log/exception
            console.log("Unexpected object not found in parent array", parentArray, p, k, parents.length);
            throw "Unexpected object not found in parent array";
          }
        } else {
          console.log("Unexpected parent with no _fieldName and no parent array", k, parents);
          throw "Unexpected parent with no _fieldName and no parent array";
        }
      }
      return path;
    };

    var changePusher = function(parents, child, item) {
      // var path = _getPath(parents, child);
      // var c2 = _reference(model, path);
      // console.log("roundabout", path, child == c2);

      // console.log("UM", mode, typeof child.oldValues, typeof item);
      // console.log("change", path, item, ko.utils.unwrapObservable(child), model());

      if (mode == MODE_IGNORE) return;

      var act;

      if (mode == MODE_MERGE) {
        // console.log("UR", "mergemode");
        act = makeUndoAction(parents, child, item);
        if (typeof act !== 'undefined') {
          act.mergedAction = function(newAction) {
            if (typeof newAction.mergeMe !== 'undefined' && newAction.mergeMe) {
              return _combinedFunction(newAction, this);
            } else return null;
          };
          act.mergeMe = true;
        }
      } else {
        act = makeUndoAction(parents, child, item);
        if (typeof act !== 'undefined') {
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
      }
      if (typeof act !== 'undefined') _push(act);
    };

    ko.watch(model, { depth: -1, oldValues: 1, mutable: true, /* tagParentsWithName: true */ tagFields: true }, changePusher);

		return {
			push: _push, 
			undoCommand: _xdoCommand(options.undoLabel, STATE_UNDOING, undoStack),
			redoCommand: _xdoCommand(options.redoLabel, STATE_REDOING, redoStack),
			reset: function() { undoStack.removeAll(); redoStack.removeAll(); },
      // setMode: function(newMode) { mode = newMode; _removeMergedAction(undoStack); },
      setModeOnce: function() { mode = MODE_ONCE; _removeMergedAction(undoStack); },
      setModeMerge: function() { mode = MODE_MERGE; _removeMergedAction(undoStack); },
      setModeNormal: function() { mode = MODE_NORMAL; _removeMergedAction(undoStack); },
      setDereference: function(useDereference) { makeUndoAction = useDereference ? makeUndoActionDereferenced : makeUndoActionDefault; }
		};
  };
  
}));