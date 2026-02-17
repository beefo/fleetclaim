FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj files
COPY src/FleetClaim.Core/FleetClaim.Core.csproj FleetClaim.Core/
COPY src/FleetClaim.Admin/FleetClaim.Admin.csproj FleetClaim.Admin/

# Restore
RUN dotnet restore FleetClaim.Admin/FleetClaim.Admin.csproj

# Copy source
COPY src/FleetClaim.Core/ FleetClaim.Core/
COPY src/FleetClaim.Admin/ FleetClaim.Admin/

# Copy static files
COPY src/FleetClaim.Admin/wwwroot/ FleetClaim.Admin/wwwroot/

# Build
RUN dotnet publish FleetClaim.Admin/FleetClaim.Admin.csproj -c Release -o /app

# Runtime
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app

# Install gcloud CLI for job listing
RUN apt-get update && apt-get install -y curl gnupg && \
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] http://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && \
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key --keyring /usr/share/keyrings/cloud.google.gpg add - && \
    apt-get update && apt-get install -y google-cloud-cli && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "FleetClaim.Admin.dll"]
