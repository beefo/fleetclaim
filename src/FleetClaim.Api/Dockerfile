FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj files and restore
COPY src/FleetClaim.Core/FleetClaim.Core.csproj FleetClaim.Core/
COPY src/FleetClaim.Api/FleetClaim.Api.csproj FleetClaim.Api/
RUN dotnet restore FleetClaim.Api/FleetClaim.Api.csproj

# Copy source and build
COPY src/FleetClaim.Core/ FleetClaim.Core/
COPY src/FleetClaim.Api/ FleetClaim.Api/
RUN dotnet publish FleetClaim.Api/FleetClaim.Api.csproj -c Release -o /app

# Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .

# Cloud Run uses PORT env var
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "FleetClaim.Api.dll"]
