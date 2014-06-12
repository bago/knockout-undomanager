KO-UndoManager
==============

A [KnockoutJS](http://knockoutjs.com/) plugin relying on the [KO-Reactor](https://github.com/ZiadJ/knockoutjs-reactor) library to provide multilevel undo/redo management for the whole viewModel. Undo/redo stacks keeps only changes (functions to set the previous value in the observable) limiting the needed memory.
KO-UndoManager also detects move operations (removed+added operations for the same object) and merge them to a single operation so that you don't have to undo twice to undo a move to/in/between observable arrays.

##Usage

```js

      var viewModel = {
         ...
         // the subtree we want to track
         content: {
           ... the observables tree ...
         }
         ...
      };

      var undoRedoStack = ko.undoManager(viewModel.content, { levels: 10, undoLabel: "undo (#COUNT#)", redoLabel: "redo" });
      viewModel.undo = undoRedoStack.undoCommand;
      viewModel.redo = undoRedoStack.redoCommand;
```

And then:

```html
      <div id="toolbar">
        <a href="#" data-bind="if: $root.undo.enabled(), click: $root.undo.execute, text: $root.undo.name">UNDO</a>
        <a href="#" data-bind="if: $root.redo.enabled(), click: $root.redo.execute, text: $root.redo.name">REDO</a>
      </div>
```

Or using [Knockout-Jqueryui](http://gvas.github.io/knockout-jqueryui/):

```html
      <div id="toolbar">
        <a href="#" data-bind="click: $root.undo.execute, clickBubble: false, button: { disabled: !$root.undo.enabled(), icons: { primary: 'ui-icon-arrowreturnthick-1-w' }, label: $root.undo.name, text: true }">UNDO</a>
        <a href="#" data-bind="click: $root.redo.execute, clickBubble: false, button: { disabled: !$root.redo.enabled(), icons: { primary: 'ui-icon-arrowreturnthick-1-e' }, label: $root.redo.name, text: true }">REDO</a>
      </div>
```

##License

Copyright (c) 2014 Stefano Bagnara.
evol.colorpicker is released under the [MIT license](http://github.com/bago/knockout-undomanager/raw/master/LICENSE.md).
