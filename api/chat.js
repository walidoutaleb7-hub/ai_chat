export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const { message } = req.body || {};

        if (!message || typeof message !== "string") {
            return res.status(400).json({
                error: "Message is required"
            });
        }

        const response = await fetch(
            "https://api.openai.com/v1/responses",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    "Authorization":
                        `Bearer ${process.env.OPENAI_API_KEY}`
                },

                body: JSON.stringify({
                    model: "gpt-5.6-mini",

                    instructions: `
أنت NEURA، مساعد ذكاء اصطناعي ذكي.
هدفك ليس فقط الإجابة، بل مساعدة المستخدم
على فهم المشكلة والتخطيط للحل وتنفيذه بشكل واضح.

كن دقيقًا ومفيدًا ومختصرًا عندما لا يحتاج الأمر
إلى شرح طويل.
                    `,

                    input: message
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: data
            });
        }

        return res.status(200).json({
            reply: data.output_text || "لم أتمكن من إنشاء رد."
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Internal server error"
        });
    }
}