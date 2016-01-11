/**
 *
 * Cashew is a JAVA parser written in JavaScript.
 *
 * Cashew is written by Lucas Farias and Rafael Monteiro and released under an MIT
 * license. It was written using (Jison)[https://github.com/zaach/jison] by Zaach.
 *
 * Git repository for Cashew are available at
 *
 *     https://github.com/codecombat/cashew.git
 *
 * Please use the [github bug tracker][ghbt] to report issues.
 *
 * [ghbt]: https://github.com/codecombat/cashew/issues
 *
 **/
(function(root, mod) {
	if (typeof exports == "object" && typeof module == "object") return mod(exports);
	if (typeof define == "function" && define.amd) return define(["export"], mod);
	mod(root.cashew || (root.cashew = {}));
})(this, function(exports){

var variablesDictionary;
var methodsDictionary;
var mainMethodCall;

exports.Cashew = function(javaCode){
	variablesDictionary = [];
	methodsDictionary = [];
	mainMethodCall = undefined;
	
	//parser helpers
	parser.yy._ = _;

	function getRuntimeFunctions(range){
		var functions = new node("MemberExpression");
		functions.range = range;
		var runtime = createIdentifierNode("___JavaRuntime", range);

		var runtimeMethod =  createIdentifierNode("functions", range);

		functions.object = runtime;
		functions.property = runtimeMethod;
		functions.computed = false;
		return functions;
	}

	function getRuntimeOps(range){
		var functions = new node("MemberExpression");
		functions.range = range;
		var runtime = createIdentifierNode("___JavaRuntime", range);

		var runtimeMethod =  createIdentifierNode("ops", range);

		functions.object = runtime;
		functions.property = runtimeMethod;
		functions.computed = false;
		return functions;
	}

	getVariableType = function(varName){
		var varType = "unknown";
		_.each(variablesDictionary, function(variableEntry){
			if(variableEntry.name == varName){
				varType = variableEntry.type;
			}
		});
		return varType;
	}

	getArgumentForName = function(name, range){
		return createLiteralNode(name, "\""+name + "\"", range);
	}

	getArgumentForVariable = function(name, range){
		return createIdentifierNode(name, range);
	}

	getNullArgument = function(){
		return createLiteralNode(null, "null", [0,0]);
	}

	getArgumentForNumber = function(number, range){
		return createLiteralNode(number, number, range);

	}

	/** AST Variable declaration and validation **/

	var varEntryId = 0;
	variableEntry = function(varName, varAccess, varType, varScope, varClass, varMethod, varASTNodeID){
		this.id = varEntryId;
    	this.name = varName;
    	this.access = varAccess;
    	this.type = varType;
    	this.scope = varScope;
    	this.clazz = varClass;
    	this.method = varMethod;
    	this.ASTNodeID = varASTNodeID;
		varEntryId += 1;
	}

	parser.yy.createMethodSignatureObject = function createMethodSignatureObject(methodIdentifier, methodSignature, params, range){
		var methodSignatureObject = {
			'methodName' : methodIdentifier,
			'methodSignature' : methodSignature,
			'range' : range,
			'returnType' : null,
			'modifiers' : null,
			'clazz' : "__TemporaryClassName",
			'params' : params,
		}
		return methodSignatureObject;
	}


	// auxiliary functions

	//
	//This method is going to recursively look for all the references using a variable from this block and bellow it
	//TODO: make this more clear
	findUpdateChildren = function(ast, variable) {
	  for (var k in ast) {
	    if (typeof ast[k] == "object" && ast[k] !== null) {
	     	var node = ast[k];
	     	if(node.type !== undefined && node.type === "VariableDeclarator"){
				if(node.id.name == variable.name){
					node.javaType = variable.type;
					node.id.name = "__" + variable.id;
				}
			}
			if(node.type === "LogicalExpression" || node.type === "BinaryExpression"){
				if(node.left.name == variable.name){
					node.javaType = variable.type;
					node.left.name = "__" + variable.id;
				}
				if(node.right.name == variable.name){
					node.javaType = variable.type;
					node.right.name = "__" + variable.id;
				}
			}
			if( node.type === "SwitchStatement"){
				if(node.discriminant.type === "Identifier" && node.discriminant.name == variable.name){
					node.discriminant.javaType = variable.type;
					node.discriminant.name = "__" + variable.id;
				}
			}
			if(node.type === "UnaryExpression" || node.type === "ReturnStatement"){
				if(node.argument.type === "Identifier" && node.argument.name == variable.name){
					node.argument.javaType = variable.type;
					node.argument.name = "__" + variable.id;
				}
			}
			if(node.type === "CallExpression"){
				if(node.name && node.name == variable.name){
					node.javaType = variable.type;
					node.name = "__" + variable.id;	
				}
				_.each(node.arguments, function(argNode){
					if(argNode.type == "Identifier" && argNode.name == variable.name){
						node.javaType = variable.type;
						argNode.name = "__" + variable.id;
					}
				});
				if(node.callee.property && node.callee.property.name == "validateSet" && node.callee.object.object.name == "___JavaRuntime"){
					if(node.arguments[1].type == "Identifier" && node.arguments[1].name == "__" + variable.id){
						node.arguments[1].type = "Literal";

						node.arguments[1].name = undefined;

						node.arguments[1].value = "__" + variable.id;
						node.arguments[1].javaType = variable.type;
					}
				}
			}
			if(node.type === "Identifier"){
				if(node.name == variable.name){
					node.name = "__" + variable.id;
					node.javaType = variable.type;
				}
			}
			if(node.type === "ReturnStatement"){
				if(node.argument.name && node.argument.name == variable.name){
					node.argument.name = "__" + variable.id;
					node.javaType = variable.type;
				}
			}
			if(node.type !== undefined && node.type == "AssignmentExpression"){
				if (node.left.name && node.left.name == variable.name){
					node.left.name = "__" + variable.id;
					node.left.javaType = variable.type;
				}
				_.each(node.right.arguments, function(argNode){
					if(argNode.type == "Identifier" && argNode.name == variable.name){
						argNode.name = "__" + variable.id;
						argNode.javaType = variable.type;
					}
				});
			}
			
			ast[k] = node;
			ast[k] = findUpdateChildren(ast[k], variable);
	    }
	  }
	  return ast;
	}

	//This method is going to recursively look for all the references using method calls from this block and bellow it
	findUpdateMethodCalls = function(ast, returnType) {
		for (var k in ast) {
			if (typeof ast[k] == "object" && ast[k] !== null) {
	     		var node = ast[k];

				ast[k] = node;
				ast[k] = findUpdateChildren(ast[k], variable);
			}
		}
		return ast;
	}
	
	/** AST generation methods and structures **/

	var ASTNodeID = 0;
	var ast = {
	    rootNode: {
	        type : "Program",
	        ASTNodeID: 0,
	        range: [],
	        body : []
	    },
	    currentNode: this.rootNode,
	    createRoot: function(node, range) {
	     this.rootNode.range = range;
	     if(node != null){
	     	this.rootNode.body = this.rootNode.body.concat(node);
	     	checkForMainMethod();
	     	if(mainMethodCall){
	     		this.rootNode.body.push(mainMethodCall);
	     	}
	     }

	     return this.rootNode;
	    }

	  };
	parser.yy.ast = ast;

	node = function(type){
		ASTNodeID += 1;
		this.type = type;
		this.ASTNodeID = ASTNodeID;
	}

	var checkForMainMethod = function checkForMainMethod(){
		_.each(methodsDictionary, function(methodsEntry){
			if(methodsEntry.methodName == "main"){
				var expressionNode = new node("ExpressionStatement");
			     expressionNode.range = methodsEntry.range;

			     var expressionNodeExpression = new node("CallExpression");
			     expressionNodeExpression.range = methodsEntry.range;

			     var myClassIndentifier = createIdentifierNode(methodsEntry.clazz, methodsEntry.range);
			     var mainIdentifierProperty = createIdentifierNode("main", methodsEntry.range);
			     expressionNodeExpression.callee = createMemberExpressionNode(myClassIndentifier, mainIdentifierProperty, methodsEntry.range);

			     expressionNodeExpression.arguments = [];

			     expressionNode.expression = expressionNodeExpression;
			     mainMethodCall = expressionNode;
			}
		});
	}

	var createLiteralNode = parser.yy.createLiteralNode = function createLiteralNode(value, raw, range){
		var literalNode = new node("Literal");
		literalNode.range = range;
		literalNode.value = value;
		literalNode.raw = ""+raw;
		return literalNode;
	}

	var createIdentifierNode = parser.yy.createIdentifierNode = function createIdentifierNode(name, range){
		var identifierNode = new node("Identifier");
		identifierNode.range = range;
		identifierNode.name = name;
		return identifierNode;
	}
	var createArrayIdentifierNode = parser.yy.createArrayIdentifierNode = function createArrayIdentifierNode(varName, varRange, index1Node, index1Range, index2Node, index2Range, range){
		var identifierNode = createMemberExpressionNode(createIdentifierNode(varName, varRange), index1Node, index1Range, true);
		if(index2Node){
			identifierNode = createMemberExpressionNode(identifierNode, index2Node, index2Range, true);
		}
		return identifierNode;
	}

	var createMemberExpressionNode = function createMemberExpressionNode(objectNode, propertyNode, range, computed){
		var memberExpressionNode = new node("MemberExpression");
		memberExpressionNode.computed = computed || false;
		memberExpressionNode.range = range;
		memberExpressionNode.object = objectNode;
		memberExpressionNode.property = propertyNode;
		return memberExpressionNode;
	}

	parser.yy.createUpdateClassVariableReference = function createUpdateClassVariableReference(variableNodes, className, block){
		_.each(variableNodes, function(variableNode){
			_.each(variableNode.declarations, function(varNode){
				var newVar = new variableEntry(varNode.id.name, "", variableNode.javaType, 
					"class", className, "", variableNode.ASTNodeID);
				findUpdateChildren(block, newVar);
				variablesDictionary.push(newVar);
			});
		});
	}

	parser.yy.createUpdateMethodVariableReference = function createUpdateMethodVariableReference(variableNodes, methodProperties, block){
		_.each(variableNodes, function(variableNode){
			var newVar = new variableEntry(variableNode.declarations[0].id.name, "", variableNode.javaType, 
				"method", "", methodProperties.methodSignature, variableNode.ASTNodeID);
			findUpdateChildren(block, newVar);
			variablesDictionary.push(newVar);
		});
	}

	createUpdateParamVariableReference = function createUpdateParamVariableReference(paramNodes, methodProperties, block){
		_.each(paramNodes, function(paramNode){
			var newVar = new variableEntry(paramNode.name, "", paramNode.javaType, 
				"method", "", methodProperties.methodSignature, paramNode.ASTNodeID);
			findUpdateChildren(block, newVar);
			findUpdateChildren(paramNodes, newVar);
			variablesDictionary.push(newVar);
		});
	}

	parser.yy.createUpdateBlockVariableReference = function createUpdateBlockVariableReference(variableNodes, block){
		_.each(variableNodes, function(variableNode){
			_.each(variableNode.declarations, function(varNode){
				var newVar = new variableEntry(varNode.id.name, "", variableNode.javaType, 
					"", "", "", variableNode.ASTNodeID);
				findUpdateChildren(block, newVar);
				variablesDictionary.push(newVar);
			});
		});
	}

	parser.yy.createMethodDeclarationNode = function createMethodDeclarationNode(methodSignatureObject, headerRange, methodBodyNodes, methodBodyRange, range){
		if(methodSignatureObject.returnType == 'void'){
			_.each(methodBodyNodes , function(bodyNode){
				if(bodyNode.type === "ReturnStatement"){
					throw SyntaxError("Cannot return a value from method whose return type is void");
				}
			});
		}
		var isStatic = false;
		_.each(methodSignatureObject.modifiers, function(modifier){
			if (modifier == "static"){
				isStatic = true;
			}
		});

		var isPrivate = true;
		_.each(methodSignatureObject.modifiers, function(modifier){
			if (modifier == "public"){
				isPrivate = false;
			}
		});

		methodsDictionary.push(methodSignatureObject);
		var functionDeclarationNode = new node("ExpressionStatement");
		functionDeclarationNode.range = range;

		var functionDeclarationNodeAssignment = new node("AssignmentExpression");
		functionDeclarationNodeAssignment.range = range;
		functionDeclarationNodeAssignment.operator = '=';

		var functionDeclarationNodeAssignmentLeftObject;
		if(isStatic){
			functionDeclarationNodeAssignmentLeftObject = createIdentifierNode("__TemporaryClassName", [0,0]);
		}else{
			functionDeclarationNodeAssignmentLeftObject = createMemberExpressionNode(createIdentifierNode("__TemporaryClassName", [0,0]), createIdentifierNode("prototype", headerRange), headerRange);
		}

		var functionDeclarationNodeAssignmentLeft;
		if(isPrivate){
			functionDeclarationNodeAssignmentLeft =  createIdentifierNode(methodSignatureObject.methodName, headerRange);
		}else{
			functionDeclarationNodeAssignmentLeft = createMemberExpressionNode(functionDeclarationNodeAssignmentLeftObject, createIdentifierNode(methodSignatureObject.methodName, headerRange), range);
		}
			
		functionDeclarationNodeAssignment.left = functionDeclarationNodeAssignmentLeft;

		var functionDeclarationNodeAssignmentRight = new node("FunctionExpression");
		functionDeclarationNodeAssignmentRight.range = methodBodyRange;
		functionDeclarationNodeAssignmentRight.id = null;
		if(methodSignatureObject.params == null){
			functionDeclarationNodeAssignmentRight.params = [];
		}else{
			var paramNodes = [];
			_.each(methodSignatureObject.params, function(param){
				var newParam = createIdentifierNode(param.paramName, param.range);
				newParam.javaType = param.type;
				paramNodes.push(newParam);
			});
			createUpdateParamVariableReference(paramNodes, methodSignatureObject, methodBodyNodes);
			functionDeclarationNodeAssignmentRight.params = paramNodes;
		}
		functionDeclarationNodeAssignmentRight.defaults = [];
		functionDeclarationNodeAssignmentRightBody = new node("BlockStatement");
		functionDeclarationNodeAssignmentRightBody.range = methodBodyRange;
		functionDeclarationNodeAssignmentRightBody.body = [];
		functionDeclarationNodeAssignmentRightBody.body = functionDeclarationNodeAssignmentRightBody.body.concat(methodBodyNodes);
		functionDeclarationNodeAssignmentRight.body = functionDeclarationNodeAssignmentRightBody;
		functionDeclarationNodeAssignmentRight.generator = false;
		functionDeclarationNodeAssignmentRight.expression = false;

		var functionDeclarationNodeAssignmentMethod = new node("AssignmentExpression");
		functionDeclarationNodeAssignmentMethod.range = range;
		functionDeclarationNodeAssignmentMethod.operator = '='; 
		functionDeclarationNodeAssignmentMethod.left = createIdentifierNode(methodSignatureObject.methodName, headerRange);
		functionDeclarationNodeAssignmentMethod.right = functionDeclarationNodeAssignmentRight

		functionDeclarationNodeAssignment.right = functionDeclarationNodeAssignmentMethod;

		functionDeclarationNode.expression = functionDeclarationNodeAssignment;

		return functionDeclarationNode;
	}

	parser.yy.createSimpleClassDeclarationNode = function createClassDeclarationNode(className, classNameRange, classBody, classBodyRange, range){
		return createClassExtendedDeclarationNode(className, classNameRange, classBody, classBodyRange, null, null, range);
	}
	
	var createClassExtendedDeclarationNode = parser.yy.createClassExtendedDeclarationNode = function createClassExtendedDeclarationNode(className, classNameRange, classBody, classBodyRange, extensionName, extensionRange, range){ 
		var classNode = new node("ExpressionStatement");
		classNode.range = range;

		var classNameId = createIdentifierNode(className, classNameRange);

		var classNodeExpression = new node("AssignmentExpression");
		classNodeExpression.range = range;
		classNodeExpression.operator = '=';
		classNodeExpression.left = classNameId;

		var classNodeExpressionRight = new node("CallExpression");
		classNodeExpressionRight.range = range;

		var classNodeExpressionRightCallee = new node("FunctionExpression");
		classNodeExpressionRightCallee.range = range;
		classNodeExpressionRightCallee.id = null;
		classNodeExpressionRightCallee.params = [];
		classNodeExpressionRightCallee.params.push(createIdentifierNode("superClass",range));
		classNodeExpressionRightCallee.defaults = [];

		var classNodeExpressionRightCalleeBody = new node("BlockStatement");
		classNodeExpressionRightCalleeBody.range = classBodyRange;
		classNodeExpressionRightCalleeBody.body = [];

		//Does the extension
		var extensionNode = new node("ExpressionStatement");
		extensionNode.range = range;

		var extensionNodeExpression = new node("CallExpression");
		extensionNodeExpression.range = range;

		var extensionNodeExpressionCallee = new node("MemberExpression");
		extensionNodeExpressionCallee.range = range;
		extensionNodeExpressionCallee.computed = false;
		extensionNodeExpressionCallee.object = createIdentifierNode("___JavaRuntime", classNameRange);
		extensionNodeExpressionCallee.property = createIdentifierNode("extend", classNameRange);

		extensionNodeExpression.callee = extensionNodeExpressionCallee;

		extensionNodeExpression.arguments = [];
		extensionNodeExpression.arguments.push(classNameId);
		extensionNodeExpression.arguments.push(createIdentifierNode("superClass", classNameRange));

		extensionNode.expression = extensionNodeExpression;
  
        classNodeExpressionRightCalleeBody.body.push(extensionNode);

        var typeNode = new node("ExpressionStatement");
		typeNode.range = range;
        var memberExpressionVar = createMemberExpressionNode(classNameId, createIdentifierNode("type", [0,0]), range);
        var declarationNodeAssignment = new node("AssignmentExpression");
				declarationNodeAssignment.range = classNameRange;
				declarationNodeAssignment.operator = '=';
				declarationNodeAssignment.left = memberExpressionVar;
				declarationNodeAssignment.right = getArgumentForName(className, classNameRange);
		typeNode.expression = declarationNodeAssignment;

		classNodeExpressionRightCalleeBody.body.push(typeNode);
		//TODO when the class declares the constructor
		classNodeExpressionRightCalleeBody.body.push(createDefaultConstructorNode(className, classNameRange));

		//Add Methods to the class
		replaceTemporaryClassWithClassName(classBody, className);
		_.each(methodsDictionary, function(methodSignature){
			if(methodSignature.clazz == "__TemporaryClassName"){
				methodSignature.clazz = className;
			}
		});
		classNodeExpressionRightCalleeBody.body = classNodeExpressionRightCalleeBody.body.concat(classBody);

		//Return the class
		classNodeExpressionRightCalleeBody.body.push(createReturnStatementNode(createIdentifierNode(className, classNameRange), classNameRange));

		classNodeExpressionRightCallee.body = classNodeExpressionRightCalleeBody;
		classNodeExpressionRightCallee.generator = false;
		classNodeExpressionRightCallee.expression = false;

		classNodeExpressionRight.callee = classNodeExpressionRightCallee;

		classNodeExpressionRight.arguments = [];
		var extensionClass;
		if(extensionName == null){
			extensionClass = createMemberExpressionNode(createIdentifierNode("___JavaRuntime", classNameRange),createIdentifierNode("_Object", classNameRange),classNameRange);
		}else{
			extensionClass = createIdentifierNode(extensionName, extensionRange);
		}

		classNodeExpressionRight.arguments.push(extensionClass);

		classNodeExpression.right = classNodeExpressionRight;

		classNode.expression = classNodeExpression;
		return classNode;
	}

	parser.yy.createFieldVariableNode = function createFieldVariableNode(modifiers, variableDeclarationNode, range){
		var isStatic = false;
		_.each(modifiers, function(modifier){
			if (modifier == "static"){
				isStatic = true;
			}
		});
		var isPrivate = true;
		_.each(modifiers, function(modifier){
			if (modifier == "public"){
				isPrivate = false;
			}
		});

		_.each(variableDeclarationNode.declarations, function(varNode){
			var prototypeClassObject;
			if(isStatic){
				prototypeClassObject = createIdentifierNode("__TemporaryClassName", [0,0]);
			}else{
				prototypeClassObject = createMemberExpressionNode(createIdentifierNode("__TemporaryClassName", [0,0]), createIdentifierNode("prototype", range), range);
			}
			var memberExpressionVar;
			if(isPrivate){
				memberExpressionVar =  varNode.id;
			}else{
				memberExpressionVar = createMemberExpressionNode(prototypeClassObject, varNode.id, range);
			}
			
			if(varNode.init == null){
				varNode.init = memberExpressionVar;
			}else{
				var declarationNodeAssignment = new node("AssignmentExpression");
				declarationNodeAssignment.range = range;
				declarationNodeAssignment.operator = '=';
				declarationNodeAssignment.left = memberExpressionVar;
				var oldInit = varNode.init;
				declarationNodeAssignment.right = oldInit;
				varNode.init = declarationNodeAssignment;
			}
		});
		return variableDeclarationNode;

	}

	var replaceTemporaryClassWithClassName = function replaceTemporaryClassWithClassName(ast, className){
		for (var k in ast) {
		    if (typeof ast[k] == "object" && ast[k] !== null) {
				var node = ast[k];
				if(node.type !== undefined && node.type == 'Identifier' && node.name == '__TemporaryClassName'){
					node.name = className;
				}
				ast[k] = node;
				ast[k] = replaceTemporaryClassWithClassName(ast[k], className);
			}
		}
		return ast;
	}

	var createDefaultConstructorNode = function createDefaultConstructorNode(className, range){

		var constructorNode = new node("FunctionDeclaration");
		constructorNode.range = range;
		constructorNode.id = createIdentifierNode(className, range);
		constructorNode.params = [];
		constructorNode.defaults = [];

		var constructorNodeBody = new node("BlockStatement");
		constructorNodeBody.range = range;
		constructorNodeBody.body = [];

		var constructorCallNode = new node("CallExpression");
		constructorCallNode.range = range;

		//creates the Myclass.__super__.constructor.apply(this, arguments)
		var classNameObjectNode = createIdentifierNode(className, range);
		var superPropertyNode = createIdentifierNode("__super__", range);

		var superMemberExpression = createMemberExpressionNode(classNameObjectNode, superPropertyNode, range);
		var constructorPropertyNode = createIdentifierNode("constructor", range);

		var constructorMemberExpression = createMemberExpressionNode(superMemberExpression, constructorPropertyNode, range);
		var applyPropertyNode = createIdentifierNode("apply", range);

		var constructorCallNodeCallee = createMemberExpressionNode(constructorMemberExpression, applyPropertyNode, range);

		constructorCallNode.callee = constructorCallNodeCallee;

		constructorCallNode.arguments = [];

		var thisExpressionNode = new node("ThisExpression");
		thisExpressionNode.range = range;
		constructorCallNode.arguments.push(thisExpressionNode);

		var argumentsNode = createIdentifierNode("arguments", range);
		constructorCallNode.arguments.push(argumentsNode);

		//Returns the class
		constructorNodeBody.body.push(createReturnStatementNode(constructorCallNode, range));

		constructorNode.body = constructorNodeBody;
		constructorNode.generator = false;
		constructorNode.expression = false;
		return constructorNode;
	}

	parser.yy.createInvokeNode = function createInvokeNode(nameOrObject, nameRange, invokeNode, invokeRange, range){
		var classObjectNode;
		if(typeof nameOrObject === "string"){
			classObjectNode = createIdentifierNode(nameOrObject, nameRange);
		}else{
			classObjectNode = nameOrObject;
		}
		var propertyNode, memberExpressionNode;
		if(typeof invokeNode === "string"){
			propertyNode = createIdentifierNode(invokeNode, invokeRange);
			memberExpressionNode = createMemberExpressionNode(classObjectNode, propertyNode, range);
			return memberExpressionNode;
		}else{
			propertyNode = invokeNode.callee;
			memberExpressionNode = createMemberExpressionNode(classObjectNode, propertyNode, range);
			invokeNode.callee = memberExpressionNode;
			return invokeNode;
		}
		
	}

	parser.yy.createSimpleMethodInvokeNode = function createSimpleMethodInvokeNode(methodName, methodRange, argumentsNodes, range){
		var methodNode = createIdentifierNode(methodName, methodRange);
		var methodInvokeNodeExpression = new node("CallExpression");
		methodInvokeNodeExpression.range = range;
		methodInvokeNodeExpression.callee = methodNode;
		//TODO: Validate argument types
		methodInvokeNodeExpression.arguments = argumentsNodes;
		return methodInvokeNodeExpression;
	}

	parser.yy.createConstructorCall = function createConstructorCall(methodName, methodRange, argumentsNodes, range){
		var constructorNode = new node("NewExpression");
		constructorNode.range = range;
		constructorNode.callee = createIdentifierNode(methodName, methodRange);
		//TODO: Validate argument types
		constructorNode.arguments = argumentsNodes;
		return constructorNode;
	}

	var createVariableAttribution = parser.yy.createVariableAttribution = function createVariableAttribution(varName, varRange, assignmentRange, expressionNode, index1, index2){
		var assignmentNode = new node("ExpressionStatement");
		assignmentNode.range = assignmentRange;

		var assignmentExpressionNode = new node("AssignmentExpression");
		assignmentExpressionNode.range = assignmentRange;
		assignmentExpressionNode.operator = '=';

		var varIdentifier = createIdentifierNode(varName, varRange); 
		var assignmentNodeLeft;

		if(index1){
			assignmentNodeLeft = createMemberExpressionNode(varIdentifier, index1, varRange, true);
			if(index2){
				assignmentNodeLeft = createMemberExpressionNode(assignmentNodeLeft, index2, varRange, true);
			}
		}else{
			assignmentNodeLeft = varIdentifier;
		}
		assignmentExpressionNode.left = assignmentNodeLeft;

		if(expressionNode.type === "NewExpression"){
			assignmentExpressionNode.right = expressionNode;
		}else{
			var setNode = createRuntimeValidateSet(varName, varRange, expressionNode, index1, index2, assignmentRange);
			assignmentExpressionNode.right = setNode;
		}
		assignmentNode.expression = assignmentExpressionNode;
		return assignmentNode;
	}

	parser.yy.createEmptyStatement = function createEmptyStatement(range){
		var emptyStatement = new node("EmptyStatement");
		emptyStatement.range = range;
		return emptyStatement;
	}

	parser.yy.createMathOperation = function createMathOperation(op, left, right, range){
		var operation;
		switch (op){
			case '+':
				operation = "add";
				break;
			case '-':
				operation = "sub";
				break;
			case '*':
				operation = "mul";
				break;
			case '/':
				operation = "div";
				break;
			case '%':
				operation = "mod";
				break;
			default:
				throw SyntaxError('Invalid Operation');
				break;
		}

		var operationNode = new node("CallExpression");
		operationNode.range = range;
		operationNode.arguments = [];
		operationNode.arguments.push(left);
		operationNode.arguments.push(right);
		var callee = new node("MemberExpression");
		callee.range = range;

		var ops = getRuntimeOps(range);

		var opsProperty = createIdentifierNode(operation, range);

		callee.object = ops;
		callee.property = opsProperty;
		callee.computed  = false;

		operationNode.callee = callee;

		return operationNode;
	}

	parser.yy.createExpression = function createExpression(op, type, left, right, range){
		var logicalNode = new node(type);
		logicalNode.range = range;
		logicalNode.operator = op;
		logicalNode.left = left;
		logicalNode.right = right;
		return logicalNode;
	}

	parser.yy.createUnaryExpression = function createExpression(op, expression, range){
		var unaryNode = new node("UnaryExpression");
		unaryNode.range = range;
		unaryNode.operator = op;
		unaryNode.prefix = "true";
		unaryNode.argument = expression;
		return unaryNode;
	}

	parser.yy.createTernaryNode = function createTernaryNode(testExpression, consequentExpression, alternateExpression, expressionRange){
		var ternaryNode = new node("ConditionalExpression");
		ternaryNode.range = expressionRange;
		ternaryNode.test = testExpression;
		ternaryNode.consequent = consequentExpression;
		ternaryNode.alternate = alternateExpression;
		return ternaryNode;
	}

	parser.yy.createVarDeclarationNode = function createVarDeclarationNode(type, declarators, declarationRange){
		var varDeclarationNode = new node("VariableDeclaration");
		varDeclarationNode.range = declarationRange;
		varDeclarationNode.kind = "var";
		varDeclarationNode.javaType = type;
		varDeclarationNode.declarations = [];

		varDeclarationNode.declarations = varDeclarationNode.declarations.concat(declarators);

		return varDeclarationNode;
	}

	parser.yy.createVarDeclaratorNodeNoInit = function createVarDeclarationNodeNoInit(varName, declarationRange){
		var varDeclaratorNode = new node("VariableDeclarator");
		varDeclaratorNode.range = declarationRange;

		var idNode = createIdentifierNode(varName, declarationRange);
		varDeclaratorNode.id = idNode;
		varDeclaratorNode.init = null;

		return varDeclaratorNode;
	}

	parser.yy.createVarDeclaratorNodeWithInit = function createVarDeclarationNodeWithInit(varName, varRange, assignment, assignmentRange, declarationRange){
		var varDeclaratorNode = new node("VariableDeclarator");
		varDeclaratorNode.range = declarationRange;

		var idNode = createIdentifierNode(varName, declarationRange);

		varDeclaratorNode.id = idNode;

		if(assignment.type === "NewExpression"){
			varDeclaratorNode.init = assignment;
		}else{
			var initNode = createRuntimeValidateSet(varName, varRange, assignment, null, null, assignmentRange);
			varDeclaratorNode.init = initNode;
		}
		return varDeclaratorNode;
	}

	var createRuntimeValidateSet = function createRuntimeValidateSet(varName, varRange, assignment, index1, index2, range){
		var initNode = new node("CallExpression");
		initNode.range = range;
		initNode.arguments = [];
		initNode.arguments.push(assignment);
		initNode.arguments.push(getArgumentForVariable(varName, varRange));
		initNode.arguments.push(getArgumentForVariable(varName, varRange));
		if(index1){
			initNode.arguments.push(index1);
		}else{
			initNode.arguments.push(getNullArgument());
		}
		if(index2){
			initNode.arguments.push(index2);
		}else{
			initNode.arguments.push(getNullArgument());
		}
		initNode.arguments.push(getArgumentForNumber(assignment.ASTNodeID, range));
		
		var callee = createMemberExpressionNode(getRuntimeFunctions(range), createIdentifierNode("validateSet", range), range, false);

		initNode.callee = callee;
		return initNode;
	}

	parser.yy.createExpressionStatementNode =  function createExpressionStatementNode(expression, range){
		var expressionStatementNode = new node("ExpressionStatement");
		expressionStatementNode.range = range
		expressionStatementNode.expression = expression;
		return expressionStatementNode;
	}

	var createReturnStatementNode = parser.yy.createReturnStatementNode =  function createReturnStatementNode(expression, range){
		var returnStatementNode = new node("ReturnStatement");
		returnStatementNode.range = range
		returnStatementNode.argument = expression;
		return returnStatementNode;
	}

	var createSimpleIfNode = parser.yy.createSimpleIfNode = function createSimpleIfNode(testExpression, consequentBlock, consequentRange, ifRange){
		var simpleIf = new node("IfStatement");
		simpleIf.range = ifRange;
		simpleIf.test = testExpression;

		consequentNode = new node("BlockStatement");
		consequentNode.range = consequentRange;
		consequentNode.body = [];
		consequentNode.body = consequentNode.body.concat(consequentBlock);

		simpleIf.consequent = consequentNode;
		simpleIf.alternate = null;

		return simpleIf;
	}

	parser.yy.createSimpleIfElseNode = function createSimpleIfElseNode(testExpression, consequentBlock, consequentRange, alternateBlock, alternateRange, ifRange){
		var ifElseNode = createSimpleIfNode(testExpression, consequentBlock, consequentRange, ifRange);

		alternateNode = new node("BlockStatement");
		alternateNode.range = alternateRange;
		alternateNode.body = [];
		alternateNode.body = alternateNode.body.concat(alternateBlock);

		ifElseNode.alternate = alternateNode;

		return ifElseNode;
	}

	var createSimpleListNode = parser.yy.createSimpleListNode = function createSimpleListNode(varName, varRange, range){
		var simpleList = new node("VariableDeclarator");
		simpleList.range = range;

		var idNode = createIdentifierNode(varName, varRange);
		simpleList.id = idNode;

		var nodeList = new node("ExpressionStatement");
		simpleList.init = nodeList;

		return simpleList;
	}

	parser.yy.createListWithInitNode = function createListWithInitNode(varName, varRange, initNode, range){
		var nullList = createSimpleListNode(varName, varRange, range);
		nullList.init = initNode;
		return nullList;
	}

	var createListInitialization = parser.yy.createListInitialization = function createListInitialization(nodeType, range){
		var newExpressionNode = new node("NewExpression");
		newExpressionNode.range = range;
		var newExpressionNodecallee = createMemberExpressionNode(createIdentifierNode("___JavaRuntime", range),createIdentifierNode("_ArrayList", range), range);
		newExpressionNode.callee = newExpressionNodecallee;
		newExpressionNode.arguments = [];
		newExpressionNode.arguments.push(getArgumentForName(nodeType, range));
		return newExpressionNode;
	}

	var createSimpleArrayNode = parser.yy.createSimpleArrayNode = function createSimpleArrayNode(varName, varRange, range){
		var simpleArray = new node("VariableDeclarator");
		simpleArray.range = range;

		var idNode = createIdentifierNode(varName, varRange);
		simpleArray.id = idNode;

		var nodeArray = new node("ArrayExpression")
		nodeArray.elements = [];
		simpleArray.init = nodeArray;

		return simpleArray;
	}

	parser.yy.createArrayWithInitNode = function createArrayWithInitNode(varName, varRange, initNode, range){
		var nullArray = createSimpleArrayNode(varName, varRange, range);
		nullArray.init = initNode;
		return nullArray;
	}

	var createArrayWithNullInitialization = parser.yy.createArrayWithNullInitialization = function createArrayWithNullInitialization(nodeExp, range){
		var nodeArray = new node("ArrayExpression")
			, size = nodeExp.value || 0;
		nodeArray.range = range;	
		nodeArray.elements = [];

		// TODO: Validar a expressão que declara o tamanho do array.
		_.times(parseInt(size),function(){
			var literal = getNullArgument();
			nodeArray.elements.push(literal);
		});
		return nodeArray;
	}

	parser.yy.createTwoDimensionalArray = function createTwoDimensionalArray(nodesExp, range){
		var nodeArray = new node("ArrayExpression");
		nodeArray.range = range;
		nodeArray.elements = [];
		_.times(nodesExp[0].value, function(){
			if(nodesExp[1]){
				var literal = createArrayWithNullInitialization(nodesExp[1],range);
			}
			nodeArray.elements.push(literal);
		});
		return nodeArray;
	}

	var createArrayWithInitialization = parser.yy.createArrayWithInitialization = function createArrayWithInitialization(values, range){
		var nodeArray = new node("ArrayExpression")
			, size = values.length;
		nodeArray.range = range;	
		nodeArray.elements = [];

		for (var i = 0; i < values.length; i++) {
			if(values[i].constructor == Array){
				nodeArray.elements.push(createArrayWithInitialization(values[i],range));
			}else{
				nodeArray.elements.push(values[i]);
			}
		};
		return nodeArray;
	}

	parser.yy.validateDeclaratorsDimension = function validateDeclaratorsDimension(declaratorNodes, type){
		_.each(declaratorNodes, function(declaratorNode){
			if(declaratorNode.init.elements.length > 0 && declaratorNode.init.elements[0].type == "ArrayExpression"){
				throw TypeError("Invalid type for " + type);
			}
		});
	}

	parser.yy.validateArrayListTypes = function validateArrayListTypes(declaratorType, expressionType){
		// compare types
		if(declaratorType != expressionType){
			throw TypeError("Invalid type for " + expressionType);
		}
	}

	parser.yy.createArrayFromInitialArray = function createArrayFromInitialArray(arrays, range){
		//determine if it's 1 or 2 dimension and validates if it's more than 2 dimension
		var dimensions = 1;
		for (var i = 0; i < arrays.length; i++) {
			if(arrays[i].constructor == Array){
				dimensions = 2;
			}
		}
		if(dimensions == 2){
			for (var i = 0; i < arrays.length; i++) {
				if(arrays[i].constructor != Array){
					throw SyntaxError("Incompatible types on array");
				}
				for(var j = 0; j < arrays[i].length; j++){
					if(arrays[i][j].constructor == Array){
						throw SyntaxError("More than 2-dimension arrays are not supported");
					}
				}
			}
		}
		return createArrayWithInitialization(arrays, range);
	}

	parser.yy.createSwitchNode = function createSwitchNode(discriminant, cases, range){
		var switchNode = new node("SwitchStatement");
		switchNode.range = range;
		switchNode.discriminant = discriminant;
		switchNode.cases = [];
		switchNode.cases = switchNode.cases.concat(cases);
		return switchNode;
	}

	parser.yy.createDefaultSwitchNode = function createDefaultSwitchNode(range){
		return createCaseSwitchNode(null, range);
	}

	parser.yy.addSwitchCaseStatements = function addSwitchCaseStatements(cases, block){
		cases[cases.length -1].consequent = block;
		return cases;
	}

	var createCaseSwitchNode = parser.yy.createCaseSwitchNode = function createCaseSwitchNode(testExpression, range){
		var caseNode = new node("SwitchCase");
		caseNode.range = range;
		caseNode.test = testExpression;
		caseNode.consequent = [];
		return caseNode;
	}

	parser.yy.createSimpleWhileNode = function createSimpleWhileNode(testExpression, whileBlock, blockRange, whileRange){
		var simpleWhile = new node("WhileStatement");
		simpleWhile.range = whileRange;
		simpleWhile.test = testExpression;

		blockNode = new node("BlockStatement");
		blockNode.range = blockRange;
		blockNode.body = [];
		blockNode.body = blockNode.body.concat(whileBlock);

		simpleWhile.body = blockNode;

		return simpleWhile;
	}

	parser.yy.createDoWhileNode = function createDoWhileNode(testExpression, whileBlock, blockRange, whileRange){
		var doWhile = new node("DoWhileStatement");
		doWhile.range = whileRange;
		doWhile.test = testExpression;

		blockNode = new node("BlockStatement");
		blockNode.range = blockRange;
		blockNode.body = [];
		blockNode.body = blockNode.body.concat(whileBlock);

		doWhile.body = blockNode;

		return doWhile;
	}

	parser.yy.createBreakStatement = function createBreakStatement(range){
		var breakNode = new node("BreakStatement");
		breakNode.range = range;

		return breakNode;
	}

	parser.yy.createContinueStatement = function createContinueStatement(range){
		var continueNode = new node("ContinueStatement");
		continueNode.range = range;

		return continueNode;
	}

	parser.yy.createForStatement = function createForStatement(forInit, testExpression, updateExpressions, updateRange, forBlock, blockRange, forRange){
		var forNode = new node("ForStatement");
		forNode.range = forRange;
		forNode.init = forInit;
		forNode.test = testExpression;

		if(updateExpressions.length == 1){
			forNode.update = updateExpressions[0].expression;
		}else if(updateExpressions.length > 1){
			var sequenceNode = new node("SequenceExpression");
			sequenceNode.range = updateRange;
			sequenceNode.expressions = [];
			_.each(updateExpressions, function(updateExp){
				sequenceNode.expressions.push(updateExp.expression);
			});
			forNode.update = sequenceNode;
		}

		blockNode = new node("BlockStatement");
		blockNode.range = blockRange;
		blockNode.body = [];
		blockNode.body = blockNode.body.concat(forBlock);

		forNode.body = blockNode;

		return forNode;
	}

	parser.yy.createConsoleLogExpression = function createConsoleLogExpression(expression, range){
		var consoleLogNode = new node("CallExpression");
		consoleLogNode.range = range;
		consoleLogNode.arguments = [];
		consoleLogNode.arguments.push(expression);
		var callee = new node("MemberExpression");
		callee.range = range;

		var functions = getRuntimeFunctions(range);

		var printProperty = createIdentifierNode("print", range);

		callee.object = functions;
		callee.property = printProperty;
		callee.computed  = false;

		consoleLogNode.callee = callee;

		return consoleLogNode;
	}

	parser.yy.createClassCastNode = function createClassCastNode(type, typeRange, expression, range){
		var classCastNode = new node("CallExpression");
		classCastNode.range = range;
		classCastNode.arguments = [];
		if(type === "int" || type === "double"){
			classCastNode.arguments.push(getArgumentForName(type, typeRange));
		}else if(type === "Integer" || type === "Double" || type ===  "String" || type ===  "boolean" || type ===  "Boolean"){
			throw new SyntaxError("Invalid Class cast");
		}else{
			classCastNode.arguments.push(createIdentifierNode(type, typeRange));
		}
		classCastNode.arguments.push(expression);
		classCastNode.callee = createMemberExpressionNode(getRuntimeFunctions(range),createIdentifierNode("classCast", range),range, false);
		return classCastNode;
	}
	

	ast = parser.parse(javaCode);
	return ast;
}

exports.wrapFunction = wrapFunction = function(ast, functionName, className, staticCall){
	node = function(type){
		this.type = type;
	}
	astBody = ast.body;

	//check if there's a different static call other than the main
	if(className !== undefined && className !== ""  && staticCall !== undefined &&  staticCall !== ""){
		var staticCallNode = new node("ReturnStatement");

	    var staticCallNodeExpression = new node("CallExpression");

	    var myClassIndentifier = new node("Identifier");
			myClassIndentifier.name = className;
	    var staticCallProperty = new node("Identifier");
			staticCallProperty.name = staticCall;

		var staticCallCalee = new node("MemberExpression");
			staticCallCalee.computed = false;
			staticCallCalee.object = myClassIndentifier;
			staticCallCalee.property = staticCallProperty;

	    staticCallNodeExpression.callee = staticCallCalee;

	    staticCallNodeExpression.arguments = [];

	    staticCallNode.argument = staticCallNodeExpression;
	    astBody.push(staticCallNode);
	}else if(astBody[astBody.length-1].expression.type === "CallExpression"){
		// transform the static call into return that same static call
		var staticCallNode = new node("ReturnStatement");
		staticCallNode.argument = astBody[astBody.length-1].expression;
		astBody[astBody.length-1] = staticCallNode
	}

	fooFunctNode = new node("FunctionDeclaration")
	fooId = new node("Identifier");
	if(functionName){
		fooId.name = functionName;
	}else{
		fooId.name = "foo";		
	}
	fooFunctNode.id = fooId;
	fooFunctNode.params = [];

	fooBody = new node("BlockStatement");
	fooBody.body = [];
		functReturn = new node("ReturnStatement");
			functReturnArgument = new node("CallExpression");
				functReturnArgumentCallee = new node("MemberExpression");
				functReturnArgumentCallee.computed = false;
					functReturnArgumentCalleeObject = new node("FunctionExpression");
					functReturnArgumentCalleeObject.params = [];
					functReturnArgumentCalleeObject.defaults = [];
						functReturnArgumentCalleeObjectBody = new node("BlockStatement");
						functReturnArgumentCalleeObjectBody.body = astBody;
					functReturnArgumentCalleeObject.body = functReturnArgumentCalleeObjectBody;
					functReturnArgumentCalleeObject.generator = false;
					functReturnArgumentCalleeObject.expression = false;
				functReturnArgumentCallee.object = functReturnArgumentCalleeObject;
					functReturnArgumentCalleeProperty = new node("Identifier");
					functReturnArgumentCalleeProperty.name = "call";
				functReturnArgumentCallee.property = functReturnArgumentCalleeProperty;
			functReturnArgument.callee = functReturnArgumentCallee;
			functReturnArgument.arguments = [];
				functReturnArgumentArgumentThis = new node("ThisExpression");
			functReturnArgument.arguments.push(functReturnArgumentArgumentThis);

		functReturn.argument = functReturnArgument;

	fooBody.body.push(functReturn);
	fooFunctNode.body = fooBody;

	ast.body = [];
	ast.body.push(fooFunctNode);

	return ast;
}

exports.toNode = function(p){
  var node = new node();
  for(var prop in p){
    node[prop] = p[prop];
  }
  return node;
  function node(){}
}

_Object = (function() {

	var id = 0;

	function generateId() { 
		return id++; 
	};

	_Object.prototype.type = "_Object";

	_Object.prototype.id = function() {
		var newId = generateId();

		this.id = function() { return newId; };

		return newId;
	};

	function _Object() {
		this.id = generateId();
	};

	_Object.prototype.equals = function(other) {
		return this === other;
	};

	_Object.prototype.toString = function() {
		return this.constructor.name + "@" + this.id;
	};

	return _Object;

})();

_ArrayList = (function() {

  function _ArrayList(type) {
    this.type = type;
    this.arraylist = [];
  }

  _ArrayList.prototype.size = function() {
    return this.arraylist.length;
  };

  _ArrayList.prototype.add = function(index, object) {
  	//hacky way so we can have method overload
    if (object == undefined) {
      //todo("validate type");
      this.arraylist.push(index);
      return true;
    } else {
      if (index > 0 && index < this.arraylist.length) {
        //todo("fixthis");
        this.arraylist[index] = object;
        return true;
      } else {
        throw new SyntaxError("Index out of bounds Exception");
      }
    }
  };

  _ArrayList.prototype.get = function(index) {
    if (index < 0 || index > this.arraylist.length) {
      throw new SyntaxError("Index out of bounds Exception");
    }
    return this.arraylist[index];
  };

  _ArrayList.prototype.set = function(index, object) {
    var old;
    if (index < 0 || index > this.arraylist.length) {
      throw new SyntaxError("Index out of bounds Exception");
    }
    var old = this.arraylist[index];
    //todo("validate type");
    this.arraylist[index] = object;
    return old;
  };

  _ArrayList.prototype.remove = function(index) {
    if (index < 0 || index > this.arraylist.length) {
      throw new SyntaxError("Index out of bounds Exception");
    }
    //todo("do the index subtraction");

    return this.arraylist[index];
  };

  return _ArrayList;

})();

exports.___JavaRuntime = { 
	extend : function(child, parent) { 
		hasProp = {}.hasOwnProperty;
		for (var key in parent) { 
			if (hasProp.call(parent, key)) child[key] = parent[key]; 
		} 
		function ctor() { 
			this.constructor = child; 
		} 
		ctor.prototype = parent.prototype; 
		child.prototype = new ctor(); 
		child.__super__ = parent.prototype; 
		
		return child; 
	},

 	_Object : _Object,
 	_ArrayList : _ArrayList,

	functions : {
		print: function(str){
			console.log(str);
		},
		validateSet: function(value, variableName, variable, arrayIndex1, arrayIndex2, ASTNodeID){
			if(typeof value === "function")
				value = value();
			
			//Removes the '__' from the variable name
			var index = parseInt(variableName.substring(2));
			var varRawType = variablesDictionary[index].type;
			var type;
			//check the type
			if(variablesDictionary[index].type.indexOf("[][]")>-1){
				//if either the new value and the variable are arrays
				if (value.constructor === Array){
					if(value[0].constructor === Array){
						if(value instanceof _Object){
							type = variable.type;
							type = type + "[][]"
						}else{
							type = varRawType;
						}
					}else if(arrayIndex1 != undefined && value[0].constructor !== Array){
						//if the assign contains 1 index the variable can receive an array
						varRawType = variablesDictionary[index].type.replace('[','').replace(']','');
						if(value instanceof _Object){
							type = variable.type;
							type = type + "[]"
						}else{
							type = varRawType;
						}
					}else{
						throw new SyntaxError("Incompatible types");
					}
				} else if (arrayIndex2 != undefined && value.constructor !== Array){
					//if the assign contains 2 indexes the variable can receive only the basic type
					varRawType = variablesDictionary[index].type.replace(/\[/g,'').replace(/\]/g,'');
				}else{
					//if the variable is an array but the value is incompatible
					throw new SyntaxError("Incompatible types");
				}
			} else if(variablesDictionary[index].type.indexOf("[]")>-1){
				//if both value and variables are arrays
				if (value.constructor === Array && arrayIndex1 == undefined){
					if(value[0].constructor === Array){
						throw new SyntaxError("Incompatible types");
					}
					if(value instanceof _Object){
						type = variable.type;
						type = type + "[]"
					}else{
						type = varRawType;
					}
				}else if(arrayIndex1 != undefined){
					//if there's an index the array can recive only the basic type

					varRawType = variablesDictionary[index].type.replace('[','').replace(']','');
				}else{
					throw new SyntaxError("Incompatible types");
				}

			}
			
			if(arrayIndex1){
				if(typeof arrayIndex1 === "function")
					arrayIndex1 = arrayIndex1();
				if(typeof arrayIndex1 != 'number' || arrayIndex1 % 1 !== 0){
					throw new SyntaxError("Array index must be an integer");
				}else if(variable.constructor !== Array){
					throw new SyntaxError("Incompatible types");
				}else if(arrayIndex1 < 0 || arrayIndex1 >= variable.length){
					throw new SyntaxError("Array index out of bounds");
				}
			}
			if(arrayIndex2){
				if(typeof arrayIndex2 === "function")
					arrayIndex2 = arrayIndex2();
				if(typeof arrayIndex2 != 'number' || arrayIndex2 % 1 !== 0){
					throw new SyntaxError("Array index must be an integer");
				}else if(variable.constructor !== Array){
					throw new SyntaxError("Incompatible types");
				}else if(arrayIndex2 < 0 || arrayIndex2 >= variable[arrayIndex1].length){
					throw new SyntaxError("Array index out of bounds");
				}
			}
			switch (varRawType){
				case 'int':
					if (typeof value === 'number'){
						return Math.floor(value);
					}
					throw new SyntaxError("This is not an int maybe a cast is missing");
					break;
				case 'double':
					if (typeof value === 'number'){
						return value;
					}
					throw new SyntaxError("This is not a double maybe a cast is missing");
					break;
				case 'boolean':
					if (typeof value === 'boolean'){
						return value;
					}
					throw new SyntaxError("This is not a boolean maybe a cast is missing");
					break;
				case 'String':
					if (typeof value === 'string'){
						return value;
					}
					throw new SyntaxError("This is not a String maybe a cast is missing");
					break;
				case type:
					return value;
					break;
				default:
					break;
			}
		},
		validateIndex: function(value){
			if(typeof value === "function")
				value = value();
			if (typeof value === 'number'){
						if (value % 1 === 0){
							return value;
						}else{
							throw new SyntaxError("Possible loss of precision, received double, expected int");
						}
			}
			if(value instanceof _Object){
				throw new SyntaxError("Incompatible types, received "+ value.type +", expected int");
			}
			throw new SyntaxError("Incompatible types, received "+ typeof value  +", expected int");

		},
		classCast: function(type, value){
			if(typeof type === "string"){
				if (typeof value === "number"){
						if(type === "int"){
							return Math.floor(value);
						}else{
							return value;
						}
					}
			}else{
				if(value instanceof type){
					return type;
				}else{
					throw new SyntaxError("Invalid Class cast");
				}
			}
		}
	},
	ops : {
		add: function(arg1, arg2){
			return arg1 + arg2;
		},
		sub: function(arg1, arg2){
			return arg1 - arg2;
		},
		mul: function(arg1, arg2){
			return arg1 * arg2;
		},
		div: function(arg1, arg2){
			return arg1 / arg2;
		},
		mod: function(arg1, arg2){
			return arg1 % arg2;
		},
	},
}


});
