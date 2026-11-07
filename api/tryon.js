const FASHN_BASE = "https://api.fashn.ai/v1";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  const apiKey = process.env.FASHN_API_KEY;
  if (!apiKey) {
    return send(res, 503, { error: "Virtual try-on is not connected yet. The boutique team needs to add its FASHN API key." });
  }

  if (req.method === "POST") {
    try {
      const { modelImage, productImage } = req.body || {};
      if (typeof modelImage !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(modelImage)) {
        return send(res, 400, { error: "Please upload a valid JPG, PNG or WEBP photo." });
      }
      if (modelImage.length > 5_500_000) {
        return send(res, 413, { error: "Your photo is too large. Please choose a smaller image." });
      }
      if (typeof productImage !== "string" || !/^https:\/\//i.test(productImage) || productImage.length > 2048) {
        return send(res, 400, { error: "Please select a valid saree from our collection." });
      }

      const response = await fetch(FASHN_BASE + "/run", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model_name: "tryon-max",
          inputs: {
            product_image: productImage,
            model_image: modelImage,
            prompt: "Drape the exact saree shown in the product image on the person in a traditional Indian saree style. Preserve the original saree colour, zari border, motifs, pallu design and fabric texture as closely as possible. Keep the person's face, identity, body proportions and pose natural. Do not change the person's facial features.",
            resolution: "1k",
            generation_mode: "fast",
            num_images: 1,
            output_format: "jpeg",
            return_base64: true
          }
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.message || data.error || "The AI provider could not start the try-on.";
        return send(res, response.status === 429 ? 429 : 502, { error: String(message).slice(0, 220) });
      }
      if (!data.id) return send(res, 502, { error: "The AI provider did not return a generation ID." });
      return send(res, 200, { id: data.id });
    } catch (error) {
      return send(res, 500, { error: "Could not start the virtual try-on. Please try again." });
    }
  }

  if (req.method === "GET") {
    const id = String((req.query && req.query.id) || "");
    if (!/^[A-Za-z0-9_-]{10,120}$/.test(id)) {
      return send(res, 400, { error: "Invalid try-on request." });
    }
    try {
      const response = await fetch(FASHN_BASE + "/status/" + encodeURIComponent(id), {
        headers: { "Authorization": "Bearer " + apiKey }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return send(res, 502, { error: data.message || data.error || "Could not retrieve the AI result." });
      }
      return send(res, 200, {
        status: data.status,
        output: data.status === "completed" && Array.isArray(data.output) ? data.output : undefined,
        error: data.status === "failed" ? (data.error && data.error.message) || "The try-on could not be generated." : undefined
      });
    } catch (error) {
      return send(res, 502, { error: "Could not check the try-on status. Please try again." });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return send(res, 405, { error: "Method not allowed." });
};
