const input_element = document.getElementById("variance-inference-input");
const generated_constraints_element = document.getElementById("generated-constraints");
const simplified_constraints_element = document.getElementById("simplified-constraints");
const solution_element = document.getElementById("solution");

function process_input() {
    const declaration = input_element.value;
    let parsed_declarations;
    try {
        parsed_declarations = parse_declarations(declaration);
    } catch (e) {
        console.log(e);
        generated_constraints_element.textContent = "";
        simplified_constraints_element.textContent = "";
        solution_element.textContent = "";
        return;
    }

    const constraints = generate_constraints(parsed_declarations);
    display_constraints(constraints, generated_constraints_element, true)

    const simplified_constraints = simplify_constraints(constraints);
    display_constraints(simplified_constraints, simplified_constraints_element, false)

    const solution = solve_constraints(parsed_declarations, simplified_constraints);
    display_solution(solution, solution_element);
}


function display_constraints(constraints, element, rules) {
    element.textContent = constraints.map(c => constraint_to_string(c, rules)).join("\n");
}

function display_solution(solution, element) {
    element.textContent = solution.map(param_solution_to_string).join("\n");
}

function param_solution_to_string(param_solution) {
    return variance_to_string(param_solution.left) + " = " + variance_to_string(param_solution.right) + " (" + variance_to_name(param_solution.right) + ")";
}

function variance_to_name(variance) {
    if (variance == "+") return "covariant";
    if (variance == "-") return "contravariant";
    if (variance == "*") return "bivariant";
    if (variance == "o") return "invariant";
}

function constraint_to_string(constraint, rules) {
    const left = variance_to_string(constraint.left);
    const right = variance_to_string(constraint.right);
    const result = left + " < " + right;
    if (constraint.rule && rules)
        return `[rule ${constraint.rule}] ` + result;
    else
        return result;
}

function variance_to_string(variance, nested = false) {
    if (typeof variance == "string")
        return variance;
    else if (variance.operator == "transform") {
        const result = variance_to_string(variance.left, true) + " ⊗ " + variance_to_string(variance.right, true);
        return nested ? "(" + result + ")" : result;
    }
    else if (variance.operator == "join") {
        const result = variance_to_string(variance.left, true) + " ⊔ " + variance_to_string(variance.right, true);
        return nested ? "(" + result + ")" : result;
    }
    else if (variance.operator == "class_variance") {
        const param = variance.param;
        const cls = variance.class_declaration.name + "<" + variance.class_declaration.params.join(", ") + ">";
        return `var(${param}, ${cls})`
    }
    else if (variance.operator == "type_variance") {
        const param = variance_to_string(variance.param);
        const type = type_to_string(variance.type);
        return `var(${param}, ${type})`
    }
}

function type_to_string(type) {
    let result = type.name;
    if (type.params.length > 0) {
        result += "<";
        result += type.params.map(type_param_to_string).join(", ");
        result += ">";
    }
    return result;
}

function type_param_to_string(type_param) {
    return type_param.variance + type_to_string(type_param.type);
}


function parse_declarations(declaration) {
    const tokens = tokenize(declaration);
    return parse_tokens(tokens);
}

class TextCursor {
    constructor(text) {
        this.text = text;
        this.index = 0;
    }

    take(count) {
        const result = this.text.slice(this.index, this.index + count);
        this.index += count;
        return result;
    }

    peek(count) {
        return this.text.slice(this.index, this.index + count);
    }

    has(count) {
        return this.index + count <= this.text.length;
    }
}

function tokenize(declaration) {
    const cursor = new TextCursor(declaration);
    const tokens = [];
    while (cursor.has(1)) {
        const token = read_token(cursor);
        tokens.push(token);
    }
    return tokens;
}

function read_token(cursor) {
    if (/\s/.test(cursor.peek(1)))
        return read_whitespace(cursor);
    else if (/[0-9a-zA-Z_]/.test(cursor.peek(1)))
        return read_identifier(cursor);
    else
        return read_punctuation(cursor);
}

function read_whitespace(cursor) {
    let value = "";
    while (cursor.has(1) && /\s/.test(cursor.peek(1)))
        value += cursor.take(1);
    return { type: "whitespace", value };
}

function read_identifier(cursor) {
    let value = "";
    while (cursor.has(1) && /[0-9a-zA-Z_]/.test(cursor.peek(1)))
        value += cursor.take(1);
    return { type: "identifier", value };
}

function read_punctuation(cursor) {
    const value = cursor.take(1);
    return { type: "punctuation", value };
}

class TokenCursor {
    constructor(tokens) {
        this.tokens = tokens;
        this.index = 0;
    }

    take() {
        const result = this.tokens[this.index];
        this.index++;
        return result;
    }

    peek() {
        return this.tokens[this.index];
    }

    has() {
        return this.index < this.tokens.length;
    }
}

function parse_tokens(tokens) {
    const filtered = tokens.filter(token => token.type !== "whitespace");
    const cursor = new TokenCursor(filtered);
    const classes = [];
    while (cursor.has()) {
        classes.push(parse_class(cursor));
    }
    return classes;
}

function parse_class(cursor) {
    cursor.take(); // class
    const name = cursor.take().value;
    const params = parse_class_params(cursor);
    cursor.take(); // {
    const methods = parse_methods(cursor);
    cursor.take(); // }

    return { name, params, methods };
}

function parse_class_params(cursor) {
    cursor.take(); // <
    const params = [];
    while (cursor.peek().value != ">") {
        params.push(cursor.take().value);
        if (cursor.peek().value == ",")
            cursor.take();
    }
    cursor.take(); // >
    return params;
}

function parse_methods(cursor) {
    const methods = [];
    while (cursor.peek().value != "}") {
        methods.push(parse_method(cursor));
    }
    return methods;
}

function parse_method(cursor) {
    const return_type = parse_type(cursor);
    const name = cursor.take().value;
    const params = parse_method_params(cursor);
    cursor.take(); // ;
    return { return_type, name, params };
}

function parse_method_params(cursor) {
    cursor.take(); // (
    const params = [];
    while (cursor.peek().value != ")") {
        params.push(parse_type(cursor))
    }
    cursor.take(); // )
    return params;
}

function parse_type(cursor) {
    const name = cursor.take().value;
    const params = parse_type_params(cursor);
    return { name, params };
}

function parse_type_params(cursor) {
    if (cursor.peek().value != "<")
        return [];
    cursor.take(); // <
    const params = [];
    while (cursor.peek().value != ">") {
        params.push(parse_type_param(cursor));
        if (cursor.peek().value == ",")
            cursor.take();
    }
    cursor.take(); // >
    return params;
}

function parse_type_param(cursor) {
    if (cursor.peek().value == "?") {
        cursor.take(); // ?
        const variance_name = cursor.take().value; // super | extends
        const variance = variance_name == "super" ? "-" : "+";
        const type = parse_type(cursor);
        return { variance, type };
    }
    else {
        const type = parse_type(cursor);
        return { variance: "o", type };
    }
}

function generate_constraints(parsed_declarations) {
    const constraints = [];
    for (const parsed_declaration of parsed_declarations) {
        constraints.push(...generate_constraints_for_class(parsed_declarations, parsed_declaration));
    }
    return constraints;
}

function generate_constraints_for_class(parsed_declarations, parsed_declaration) {
    const constraints = [];
    for (const param of parsed_declaration.params) {
        constraints.push(...generate_constraints_for_param(parsed_declarations, parsed_declaration, param, parsed_declaration.methods));
    }
    return constraints;
}

function generate_constraints_for_param(parsed_declarations, parsed_declaration, param, methods) {
    const constraints = [];
    for (const method of methods) {
        constraints.push(...generate_constraints_for_method(parsed_declarations, parsed_declaration, param, method));
    }
    return constraints;
}

function generate_constraints_for_method(parsed_declarations, parsed_declaration, param, method) {
    const constraints = [];
    const return_type_constraints = generate_constraints_for_return_type(parsed_declarations, parsed_declaration, param, method.return_type);
    constraints.push(...return_type_constraints);
    for (const method_param of method.params) {
        const param_constraints = generate_constraints_for_arg_type(parsed_declarations, parsed_declaration, param, method_param);
        constraints.push(...param_constraints);
    }
    return constraints;
}

function generate_constraints_for_return_type(parsed_declarations, parsed_declaration, param, return_type) {
    const constraints = [];
    const left = class_variance(param, parsed_declaration)
    const tv = type_variance(param, return_type);
    const right = transform("+", tv)
    constraints.push({ left, right, rule: "1" });
    constraints.push(...expand_type_variance(parsed_declarations, parsed_declaration, tv));
    return constraints;
}

function generate_constraints_for_arg_type(parsed_declarations, parsed_declaration, param, arg_type) {
    const constraints = [];
    const left = class_variance(param, parsed_declaration)
    const tv = type_variance(param, arg_type);
    const right = transform("-", tv)
    constraints.push({ left, right, rule: "1" });
    constraints.push(...expand_type_variance(parsed_declarations, parsed_declaration, tv));
    return constraints;
}

function expand_type_variance(parsed_declarations, parsed_declaration, tv) {
    if (tv.type.params.length == 0 && tv.type.name == tv.param)
        return [{ left: tv, right: "+", rule: "4" }]
    else if (tv.type.params.length == 0 && tv.type.name != tv.param)
        return [{ left: tv, right: "*", rule: "2" }]
    else {
        const constraints = [];
        for (let i = 0; i < tv.type.params.length; i++) {
            const type_param = tv.type.params[i];
            const left_join = type_param.variance;

            const right_join = param_class_variance(parsed_declarations, tv.type.name, i);

            const right_transform = type_variance(tv.param, type_param.type);
            constraints.push({ left: tv, right: transform(join(left_join, right_join), right_transform), rule: "5" })
            constraints.push(...expand_type_variance(parsed_declarations, parsed_declaration, right_transform));
        }
        return constraints;
    }
}

function param_class_variance(parsed_declarations, class_name, param_index) {
    for (const parsed_declaration of parsed_declarations) {
        if (parsed_declaration.name == class_name)
            return class_variance(parsed_declaration.params[param_index], parsed_declaration);
    }
}

function class_variance(param, class_declaration) {
    return { operator: "class_variance", param, class_declaration };
}

function type_variance(param, type) {
    return { operator: "type_variance", param, type };
}


function transform(left, right) {
    return { operator: "transform", left, right }
}

function join(left, right) {
    return { operator: "join", left, right }
}




function simplify_constraints(constraints) {
    const simplified_constraints = [];
    const replaced_constraints = [];
    for (const constraint of constraints)
        simplified_constraints.push(simplify_constraint(constraint, constraints, replaced_constraints));

    return simplified_constraints
        .filter(constraint => constraint.right != "*")
        .filter(constraint => constraint.left.operator == "class_variance");

}

function simplify_constraint(constraint, constraints, replaced_constraints) {
    const left = constraint.left;
    const right = replace_with_upper_bounds(constraint.right, constraints, replaced_constraints);
    return { left, right };
}

function replace_with_upper_bounds(variance, constraints, replaced_constraints) {
    if (typeof variance == "string")
        return variance;
    else if (variance.operator == "transform") {
        return calculate(transform(
            replace_with_upper_bounds(variance.left, constraints, replaced_constraints),
            replace_with_upper_bounds(variance.right, constraints, replaced_constraints)
        ));
    }
    else if (variance.operator == "join") {
        return calculate(join(
            replace_with_upper_bounds(variance.left, constraints, replaced_constraints),
            replace_with_upper_bounds(variance.right, constraints, replaced_constraints)
        ));
    }
    else if (variance.operator == "type_variance") {
        return replace_type_variance(variance, constraints, replaced_constraints);
    }
    else if (variance.operator == "class_variance") {
        return variance;
    }
}

function replace_type_variance(variance, constraints, replaced_constraints) {
    for (const constraint of constraints)
        if (variance == constraint.left) {
            replaced_constraints.push(constraint);
            return replace_with_upper_bounds(constraint.right, constraints, replaced_constraints);
        }
    return variance;
}

function calculate(variance) {
    if (typeof variance == "string")
        return variance;
    else if (variance.operator == "transform") {
        return calculate_transform(variance);
    }
    else if (variance.operator == "join") {
        return calculate_join(variance);
    }
    else if (variance.operator == "type_variance") {
        return variance;
    }
    else if (variance.operator == "class_variance") {
        return variance;
    }
}

function calculate_transform(variance) {
    const left = calculate(variance.left);
    const right = calculate(variance.right);
    if (left == "+") return right;
    if (right == "+") return left;
    if (left == "*" || right == "*") return "*"
    if (left == "o" || right == "o") return "o"
    if (left == "+" && right == "-") return "-"
    if (left == "-" && right == "+") return "-"
    if (left == "-" && right == "-") return "+"
    return variance;
}

function calculate_join(variance) {
    const left = calculate(variance.left);
    const right = calculate(variance.right);
    if (left == "*" || right == "*") return "*"
    if (left == "o") return right;
    if (right == "o") return left;
    if (left == "+" && right == "-") return "*"
    if (left == "-" && right == "+") return "*"
    if (left == "-" && right == "-") return "-"
    if (left == "+" && right == "+") return "+"
    return variance;
}

function solve_constraints(parsed_declarations, simplified_constraints) {
    const variances = []
    for (const parsed_declaration of parsed_declarations) {
        for (const param of parsed_declaration.params)
            variances.push({
                left: class_variance(param, parsed_declaration), right: "*"
            });
    }


    for (let _ = 0; _ < 2; _++) {
        for (let _it = 0; _it < simplified_constraints.length; _it++) {
            for (const constraint of simplified_constraints) {
                const left = constraint.left;
                const right = constraint.right;
                const variance = calculate_with_lookup(right, variances)
                update_variance(left, variance, variances)
            }
        }
    }
    return variances;
}

function calculate_with_lookup(variance, variances) {
    if (typeof variance == "string")
        return variance;
    else if (variance.operator == "transform") {
        return calculate_transform(
            transform(
                calculate_with_lookup(variance.left, variances),
                calculate_with_lookup(variance.right, variances)
            )
        );
    }
    else if (variance.operator == "join") {
        return calculate_join(
            join(
                calculate_with_lookup(variance.left, variances),
                calculate_with_lookup(variance.right, variances)
            )
        );
    }
    else if (variance.operator == "class_variance") {
        return lookup(variance, variances);
    }
}

function lookup(variance, variances) {
    for (const v of variances) {
        if (v.left.param == variance.param && v.left.class_declaration.name == variance.class_declaration.name) {
            return v.right;
        }
    }
    return variance;
}

function update_variance(variance, new_variance, variances) {
    for (const v of variances) {
        if (v.left.param == variance.param && v.left.class_declaration.name == variance.class_declaration.name) {
            v.right = calculate_meet(v.right, new_variance);
        }
    }
}


function calculate_meet(left, right) {
    if (left == "o" || right == "o") return "o"
    if (left == "*") return right;
    if (right == "*") return left;
    if (left == "+" && right == "-") return "o"
    if (left == "-" && right == "+") return "o"
    if (left == right) return left;
}


input_element.addEventListener("input", process_input);
document.addEventListener("DOMContentLoaded", process_input);