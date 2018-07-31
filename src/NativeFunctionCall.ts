import {Value, ValueType, IntValue, ListValue} from './Value';
import {StoryException} from './StoryException';
import {Void} from './Void';
import {Path} from './Path';
import {InkList, InkListItem} from './InkList';
import {InkObject} from './Object';
import {asOrNull, asOrThrows} from './TypeAssertion';

export class NativeFunctionCall extends InkObject{
  public readonly Add: string 		= '+';
  public readonly Subtract: string = '-';
  public readonly Divide: string   = '/';
  public readonly Multiply: string = '*';
  public readonly Mod: string      = '%';
  public readonly Negate: string   = '_';
  public readonly Equal: string    = '==';
  public readonly Greater: string  = '>';
  public readonly Less: string     = '<';
  public readonly GreaterThanOrEquals: string = '>=';
  public readonly LessThanOrEquals: string = '<=';
  public readonly NotEquals: string   = '!=';
  public readonly Not: string      = '!';
  public readonly And: string      = '&&';
  public readonly Or: string       = '||';
  public readonly Min: string      = 'MIN';
  public readonly Max: string      = 'MAX';
  public readonly Has: string      = '?';
  public readonly Hasnt: string    = '!?';
  public readonly Intersect: string = '^';
  public readonly ListMin: string   = 'LIST_MIN';
  public readonly ListMax: string   = 'LIST_MAX';
  public readonly All: string       = 'LIST_ALL';
  public readonly Count: string     = 'LIST_COUNT';
  public readonly ValueOfList: string = 'LIST_VALUE';
  public readonly Invert: string    = 'LIST_INVERT';

  public static CallWithName(functionName: string){
		return new NativeFunctionCall(functionName);
	}

  public static CallExistsWithName(functionName: string){
		this.GenerateNativeFunctionsIfNecessary();
		return this._nativeFunctions[functionName];
	}

  get name(){
		return this._name;
	}
	set name(value: string){
		this._name = value;
		if( !this._isPrototype )
			this._prototype = NativeFunctionCall._nativeFunctions[this._name];
	}
  public _name: string;

  get numberOfParameters(){
		if (this._prototype) {
			return this._prototype.numberOfParameters;
		} else {
			return this._numberOfParameters;
		}
	}
	set numberOfParameters(value: number){
		this._numberOfParameters = value;
	}
  public _numberOfParameters: number;

  public Call(parameters: InkObject[]){
		if (this._prototype) {
			return this._prototype.Call(parameters);
		}

		if (this.numberOfParameters != parameters.length) {
			throw new Error('Unexpected number of parameters');
		}

		let hasList  = false;
		parameters.forEach((p) => {
			if (p instanceof Void) throw new StoryException('Attempting to perform operation on a void value. Did you forget to "return" a value from a function you called here?');
			if (p instanceof ListValue)
				hasList = true;
		});

		if (parameters.length == 2 && hasList){
			return this.CallBinaryListOperation(parameters);
		}

		let coercedParams = this.CoerceValuesToSingleType(parameters);
		let coercedType = coercedParams[0].valueType;

		if (coercedType == ValueType.Int) {
			return this.CallT<number>(coercedParams);
		} else if (coercedType == ValueType.Float) {
			return this.CallT<number>(coercedParams);
		} else if (coercedType == ValueType.String) {
			return this.CallT<string>(coercedParams);
		} else if (coercedType == ValueType.DivertTarget) {
			return this.CallT<Path>(coercedParams);
		} else if (coercedType == ValueType.List) {
			return this.CallT<InkList>(coercedParams);
		}

		return null;
	}

  public CallT<T>(parametersOfSingleType: Value[]){
		let param1 = parametersOfSingleType[0];
		let valType = param1.valueType;

		let val1 = param1;

		let paramCount = parametersOfSingleType.length;

		if (paramCount == 2 || paramCount == 1) {

			let opForTypeObj = this._operationFuncs[valType];
			if (!opForTypeObj) {
				throw new StoryException('Cannot perform operation '+this.name+' on '+valType);
			}

			// Binary
			if (paramCount == 2) {
				let param2 = parametersOfSingleType[1];

				let val2 = param2;

				let opForType = opForTypeObj;

				// Return value unknown until it's evaluated
				let resultVal = opForType(val1.value, val2.value);

				return Value.Create(resultVal);
			}

			// Unary
			else {

				let opForType = opForTypeObj;

				let resultVal = opForType(val1.value);

				return Value.Create(resultVal);
			}
		}

		else {
			throw new Error('Unexpected number of parameters to NativeFunctionCall: ' + parametersOfSingleType.length);
		}
	}

  public CallBinaryListOperation(parameters: InkObject[]){
		if ((this.name == '+' || this.name == '-') && parameters[0] instanceof ListValue && parameters[1] instanceof IntValue)
			return this.CallListIncrementOperation(parameters);

		let v1 = asOrNull(parameters[0], Value);
		let v2 = asOrNull(parameters[1], Value);

		if ((this.name == '&&' || this.name == '||') && (v1.valueType != ValueType.List || v2.valueType != ValueType.List)) {
			let op = asOrNull(this._operationFuncs[ValueType.Int], BinaryOp<number>);
			let result = op(v1.isTruthy ? 1 : 0, v2.isTruthy ? 1 : 0);
			return new IntValue(result);
		}

		if (v1.valueType == ValueType.List && v2.valueType == ValueType.List)
			return this.CallT<InkList>([v1, v2]);

		throw new StoryException('Can not call use ' + this.name + ' operation on ' + v1.valueType + ' and ' + v2.valueType);
	}

  public CallListIncrementOperation(listIntParams: InkObject[]){
		let listVal = asOrThrows(listIntParams[0], ListValue);
		let intVal = asOrThrows(listIntParams[1], IntValue);

		let resultInkList = new InkList();

		for (const [listItemKey, listItemValue] of listVal.value) {
			const listItem = InkListItem.fromSerializedKey(listItemKey);
			// Find + or - operation
			let intOp = this._operationFuncs[ValueType.Int];

			// Return value unknown until it's evaluated
			let targetInt = intOp(listItemValue, intVal.value);

			// Find this item's origin (linear search should be ok, should be short haha)
			let itemOrigin = null;
			for (const origin of listVal.value.origins) {
				if (origin.name == listItem.originName) {
					itemOrigin = origin;
					break;
				}
			}
			if (itemOrigin != null) {
				let incrementedItem = itemOrigin.TryGetItemWithValue(targetInt);
				if (incrementedItem.exists)
					resultInkList.Add(incrementedItem.result, targetInt);
			}
		}

		return new ListValue(resultInkList);
	}

  public CoerceValuesToSingleType(parametersIn: InkObject[]){
		let valType = ValueType.Int;

		let specialCaseList = null;

		parametersIn.forEach((obj) => {
			let val = asOrThrows(obj, Value);
			if (val.valueType > valType) {
				valType = val.valueType;
			}

			if (val.valueType == ValueType.List) {
				 specialCaseList = asOrNull(val, ListValue);
			}
		});

		// Coerce to this chosen type
		let parametersOut = [];

		if (ValueType[valType] == ValueType[ValueType.List]) {
			for (let val of parametersIn){
		val = asOrThrows(val, Value);
				    if (val.valueType == ValueType.List) {
					parametersOut.push(val);
				} else if (val.valueType == ValueType.Int) {
					let intVal = parseInt(val.valueObject);
					let list = specialCaseList.value.originOfMaxItem;

					let item = list.TryGetItemWithValue(intVal);
					if (item.exists) {
						let castedValue = new ListValue(item.result, intVal);
						parametersOut.push(castedValue);
					} else
						throw new StoryException('Could not find List item with the value ' + intVal + ' in ' + list.name);
				} else
					throw new StoryException('Cannot mix Lists and ' + val.valueType + ' values in this operation');
			}
		}

		else {
			for (let val of parametersIn){
		val = asOrThrows(val, Value);
				    let castedValue = val.Cast(valType);
				    parametersOut.push(castedValue);
			}
		}

		return parametersOut;
	}

	// constructor(name){
	// 	super();
	// 	this.name = name;
	// 	this._numberOfParameters;
  //
	// 	this._prototype;
	// 	this._isPrototype;
	// 	this._operationFuncs = null;
  //
  //
	// }

  // tslint:disable:unified-signatures
  constructor(name: string);
  constructor();
  constructor(name?: string) {
	super();
	NativeFunctionCall.GenerateNativeFunctionsIfNecessary();
	if (name) this.name = name;
  }

  public static GenerateNativeFunctionsIfNecessary(){
		if (this._nativeFunctions == null) {
			this._nativeFunctions = {};

			// Int operations
			this.AddIntBinaryOp(this.Add,      (x, y) =>x + y);
			this.AddIntBinaryOp(this.Subtract, (x, y) =>x - y);
			this.AddIntBinaryOp(this.Multiply, (x, y) =>x * y);
			this.AddIntBinaryOp(this.Divide,   (x, y) =>parseInt(x / y));
			this.AddIntBinaryOp(this.Mod,      (x, y) =>x % y);
			this.AddIntUnaryOp(this.Negate,   (x) =>-x);

			this.AddIntBinaryOp(this.Equal,    (x, y) =>x == y ? 1 : 0);
			this.AddIntBinaryOp(this.Greater,  (x, y) =>x > y  ? 1 : 0);
			this.AddIntBinaryOp(this.Less,     (x, y) =>x < y  ? 1 : 0);
			this.AddIntBinaryOp(this.GreaterThanOrEquals, (x, y) =>x >= y ? 1 : 0);
			this.AddIntBinaryOp(this.LessThanOrEquals, (x, y) =>x <= y ? 1 : 0);
			this.AddIntBinaryOp(this.NotEquals, (x, y) =>x != y ? 1 : 0);
			this.AddIntUnaryOp(this.Not,       (x) =>(x == 0) ? 1 : 0);

			this.AddIntBinaryOp(this.And,      (x, y) =>x != 0 && y != 0 ? 1 : 0);
			this.AddIntBinaryOp(this.Or,       (x, y) =>x != 0 || y != 0 ? 1 : 0);

			this.AddIntBinaryOp(this.Max,      (x, y) =>Math.max(x, y));
			this.AddIntBinaryOp(this.Min,      (x, y) =>Math.min(x, y));

			// Float operations
			this.AddFloatBinaryOp(this.Add,      (x, y) =>x + y);
			this.AddFloatBinaryOp(this.Subtract, (x, y) =>x - y);
			this.AddFloatBinaryOp(this.Multiply, (x, y) =>x * y);
			this.AddFloatBinaryOp(this.Divide,   (x, y) =>x / y);
			this.AddFloatBinaryOp(this.Mod,      (x, y) =>x % y); // TODO: Is this the operation we want for floats?
			this.AddFloatUnaryOp(this.Negate,   (x) =>-x);

			this.AddFloatBinaryOp(this.Equal,    (x, y) =>x == y ? 1 : 0);
			this.AddFloatBinaryOp(this.Greater,  (x, y) =>x > y  ? 1 : 0);
			this.AddFloatBinaryOp(this.Less,     (x, y) =>x < y  ? 1 : 0);
			this.AddFloatBinaryOp(this.GreaterThanOrEquals, (x, y) =>x >= y ? 1 : 0);
			this.AddFloatBinaryOp(this.LessThanOrEquals, (x, y) =>x <= y ? 1 : 0);
			this.AddFloatBinaryOp(this.NotEquals, (x, y) =>x != y ? 1 : 0);
			this.AddFloatUnaryOp(this.Not,       (x) =>(x == 0.0) ? 1 : 0);

			this.AddFloatBinaryOp(this.And,      (x, y) =>x != 0.0 && y != 0.0 ? 1 : 0);
			this.AddFloatBinaryOp(this.Or,       (x, y) =>x != 0.0 || y != 0.0 ? 1 : 0);

			this.AddFloatBinaryOp(this.Max,      (x, y) =>Math.max(x, y));
			this.AddFloatBinaryOp(this.Min,      (x, y) =>Math.min(x, y));

			// String operations
			this.AddStringBinaryOp(this.Add,     	(x, y) =>x + y); // concat
			this.AddStringBinaryOp(this.Equal,   	(x, y) =>x === y ? 1 : 0);
			this.AddStringBinaryOp(this.NotEquals,(x, y) =>!(x === y) ? 1 : 0);
			this.AddStringBinaryOp(this.Has,      (x, y) =>x.includes(y) ? 1 : 0);
			this.AddStringBinaryOp(this.Hasnt,      (x, y) =>x.includes(y) ? 0 : 1);

			this.AddListBinaryOp(this.Add, 		 (x, y) =>x.Union(y));
			this.AddListBinaryOp(this.Subtract,  (x, y) =>x.Without(y));
			this.AddListBinaryOp(this.Has, 		 (x, y) =>x.Contains(y) ? 1 : 0);
			this.AddListBinaryOp(this.Hasnt, 	 (x, y) =>x.Contains(y) ? 0 : 1);
			this.AddListBinaryOp(this.Intersect, (x, y) =>x.Intersect(y));

			this.AddListBinaryOp(this.Equal, 				(x, y) =>x.Equals(y) ? 1 : 0);
			this.AddListBinaryOp(this.Greater, 				(x, y) =>x.GreaterThan(y) ? 1 : 0);
			this.AddListBinaryOp(this.Less, 				(x, y) =>x.LessThan(y) ? 1 : 0);
			this.AddListBinaryOp(this.GreaterThanOrEquals, 	(x, y) =>x.GreaterThanOrEquals(y) ? 1 : 0);
			this.AddListBinaryOp(this.LessThanOrEquals, 	(x, y) =>x.LessThanOrEquals(y) ? 1 : 0);
			this.AddListBinaryOp(this.NotEquals, 			(x, y) =>!x.Equals(y) ? 1 : 0);

			this.AddListBinaryOp (this.And, 				(x, y) =>x.Count > 0 && y.Count > 0 ? 1 : 0);
   this.AddListBinaryOp (this.Or,  				(x, y) =>x.Count > 0 || y.Count > 0 ? 1 : 0);

			this.AddListUnaryOp(this.Not, (x) =>x.Count == 0 ? 1 : 0);

			this.AddListUnaryOp(this.Invert, (x) =>x.inverse);
			this.AddListUnaryOp(this.All, (x) =>x.all);
			this.AddListUnaryOp(this.ListMin, (x) =>x.MinAsList());
			this.AddListUnaryOp(this.ListMax, (x) =>x.MaxAsList());
			this.AddListUnaryOp(this.Count,  (x) =>x.Count);
			this.AddListUnaryOp(this.ValueOfList,  (x) =>x.maxItem.Value);

			// Special case: The only operation you can do on divert target values
			let divertTargetsEqual = (d1, d2) => {
				return d1.Equals(d2) ? 1 : 0;
			};
			this.AddOpToNativeFunc(this.Equal, 2, ValueType.DivertTarget, divertTargetsEqual);
		}
	}

  public AddOpFuncForType(valType: ValueType, op: object): void{
		if (this._operationFuncs == null) {
			this._operationFuncs = {};
		}

		this._operationFuncs[valType] = op;
	}

  public static AddOpToNativeFunc(name: string, args: number, valType: ValueType, op: object): void{
		let nativeFunc = this._nativeFunctions[name];
		if (!nativeFunc) {
			nativeFunc = NativeFunctionCall.internalConstructor(name, args);
			this._nativeFunctions[name] = nativeFunc;
		}

		nativeFunc.AddOpFuncForType(valType, op);
	}

  public static AddIntBinaryOp(name, op){
		this.AddOpToNativeFunc(name, 2, ValueType.Int, op);
	}
	public static AddIntUnaryOp(name, op){
		this.AddOpToNativeFunc(name, 1, ValueType.Int, op);
	}

	public static AddFloatBinaryOp(name, op){
		this.AddOpToNativeFunc(name, 2, ValueType.Float, op);
	}
	public static AddFloatUnaryOp(name, op){
		this.AddOpToNativeFunc(name, 1, ValueType.Float, op);
	}

	public static AddStringBinaryOp(name, op){
		this.AddOpToNativeFunc(name, 2, ValueType.String, op);
	}

	public static AddListBinaryOp(name, op){
		this.AddOpToNativeFunc(name, 2, ValueType.List, op);
	}
	public static AddListUnaryOp(name, op){
		this.AddOpToNativeFunc(name, 1, ValueType.List, op);
	}

  public toString(){
		return 'Native "' + this.name + '"';
	}

  public _prototype: NativeFunctionCall | null;
  public _isPrototype: boolean = false;
  public _operationFuncs: any;
  public static _nativeFunctions: any;

	// static internalConstructor(name, numberOfParamters){
	// 	let nativeFunc = new NativeFunctionCall(name);
	// 	nativeFunc._isPrototype = true;
	// 	nativeFunc.numberOfParameters = numberOfParamters;
	// 	return nativeFunc;
	// }

}
