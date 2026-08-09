import { API_BASE_URL } from "../config/apiConfig";

export async function enrichExpressionContext(payload) {
    const response = await fetch(`${API_BASE_URL}/api/expression/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(result?.error || `Expression enrichment failed: ${response.status}`);
        error.code = result?.code || "expression_enrichment_failed";
        error.status = response.status;
        throw error;
    }
    return result;
}
