from pydantic_ai import Agent
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool
from pydantic_ai.models.bedrock import BedrockConverseModel
from pydantic_ai.providers.bedrock import BedrockProvider

model = BedrockConverseModel(
    "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    provider=BedrockProvider(
        region_name="us-east-1",
    ),
)

databot = Agent(
    model,
    tools=[duckduckgo_search_tool()],
)
