from flask import Flask, render_template, request, jsonify
import copy
import math

app = Flask(__name__)


def parse_matrix(raw_matrix, n):
    """Parse raw matrix input, converting INF strings to float('inf')."""
    matrix = []
    for i in range(n):
        row = []
        for j in range(n):
            val = raw_matrix[i][j]
            if isinstance(val, str):
                val = val.strip().upper()
                if val in ("INF", "∞", "INFINITY", ""):
                    row.append(float('inf'))
                else:
                    try:
                        row.append(float(val))
                    except ValueError:
                        raise ValueError(f"Invalid value at [{i}][{j}]: '{val}'")
            elif val is None:
                row.append(float('inf'))
            else:
                try:
                    row.append(float(val))
                except (TypeError, ValueError):
                    raise ValueError(f"Invalid value at [{i}][{j}]")
        matrix.append(row)
    return matrix


def serialize_matrix(matrix):
    """Convert matrix with float('inf') to JSON-serializable format."""
    result = []
    for row in matrix:
        serialized_row = []
        for val in row:
            if val == float('inf') or math.isinf(val):
                serialized_row.append(None)  # null in JSON = INF
            else:
                serialized_row.append(val)
        result.append(serialized_row)
    return result


def floyd_warshall(matrix, n):
    """
    Run Floyd-Warshall and return all intermediate steps.
    Each step contains: k value, matrix snapshot, and changed cells.
    """
    dist = copy.deepcopy(matrix)
    steps = []

    # Store initial state (k = -1 means "initial matrix A0")
    steps.append({
        "k": -1,
        "label": "Initial Matrix (A₀)",
        "matrix": serialize_matrix(dist),
        "changed": []
    })

    for k in range(n):
        changed_cells = []
        new_dist = copy.deepcopy(dist)

        for i in range(n):
            for j in range(n):
                if dist[i][k] != float('inf') and dist[k][j] != float('inf'):
                    new_val = dist[i][k] + dist[k][j]
                    if new_val < dist[i][j]:
                        new_dist[i][j] = new_val
                        changed_cells.append({"row": i, "col": j, "old": serialize_matrix([[dist[i][j]]])[0][0], "new": new_val})

        dist = new_dist
        steps.append({
            "k": k,
            "label": f"Using vertex k = {k} (A{k + 1})",
            "matrix": serialize_matrix(dist),
            "changed": changed_cells
        })

    # Check for negative cycles
    has_negative_cycle = any(dist[i][i] < 0 for i in range(n))

    return steps, has_negative_cycle


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/compute", methods=["POST"])
def compute():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data received."}), 400

        n = data.get("n")
        raw_matrix = data.get("matrix")

        # Validate n
        if n is None:
            return jsonify({"error": "Number of vertices (n) is required."}), 400
        try:
            n = int(n)
        except (TypeError, ValueError):
            return jsonify({"error": "Number of vertices must be an integer."}), 400

        if n < 2:
            return jsonify({"error": "Number of vertices must be at least 2."}), 400
        if n > 10:
            return jsonify({"error": "Maximum 10 vertices supported for visualization."}), 400

        # Validate matrix dimensions
        if not raw_matrix:
            return jsonify({"error": "Matrix data is required."}), 400
        if len(raw_matrix) != n:
            return jsonify({"error": f"Matrix must have {n} rows, got {len(raw_matrix)}."}), 400
        for i, row in enumerate(raw_matrix):
            if len(row) != n:
                return jsonify({"error": f"Row {i} must have {n} columns, got {len(row)}."}), 400

        # Parse and validate values
        try:
            matrix = parse_matrix(raw_matrix, n)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        # Run Floyd-Warshall
        steps, has_negative_cycle = floyd_warshall(matrix, n)

        return jsonify({
            "success": True,
            "n": n,
            "steps": steps,
            "total_steps": len(steps),
            "has_negative_cycle": has_negative_cycle
        })

    except Exception as e:
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
