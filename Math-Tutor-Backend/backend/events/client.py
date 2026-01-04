import os
import inngest

# Create the Inngest client
inngest_client = inngest.Inngest(
    app_id="math_tutor_backend",
    # event_key is optional in dev, but good practice to have env var
)

